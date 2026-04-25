import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";

export interface TranscodeProgress {
  status: "transcoding" | "complete" | "error";
  progress: number; // 0–1
  message?: string;
  segments?: { filename: string; duration: number }[];
  totalDuration?: number;
}

type Listener = (progress: TranscodeProgress) => void;

interface TranscodeEntry {
  progress: TranscodeProgress;
  listeners: Set<Listener>;
  cleanupTimer: ReturnType<typeof setTimeout>;
}

// In-memory store keyed by uploadId. Entries auto-clean after 10 minutes.
const store = new Map<string, TranscodeEntry>();

export function getTranscodeEntry(uploadId: string): TranscodeEntry | undefined {
  return store.get(uploadId);
}

export function subscribeTranscode(uploadId: string, listener: Listener): () => void {
  const entry = store.get(uploadId);
  if (!entry) return () => {};
  entry.listeners.add(listener);
  return () => entry.listeners.delete(listener);
}

function notify(uploadId: string, progress: TranscodeProgress) {
  const entry = store.get(uploadId);
  if (!entry) return;
  entry.progress = progress;
  for (const listener of entry.listeners) {
    listener(progress);
  }
}

export function startTranscode(uploadId: string, inputPath: string, uploadDir: string) {
  const segmentPattern = path.join(uploadDir, "seg%d.ts");
  const playlistPath = path.join(uploadDir, "index.m3u8");

  // Register in store
  const entry: TranscodeEntry = {
    progress: { status: "transcoding", progress: 0 },
    listeners: new Set(),
    cleanupTimer: setTimeout(() => store.delete(uploadId), 10 * 60 * 1000),
  };
  store.set(uploadId, entry);

  const proc = spawn("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-vf", "scale='min(1920,iw)':-2",
    "-c:v", "libx264",
    "-profile:v", "baseline",
    "-level", "3.1",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    "-g", "60",
    "-keyint_min", "60",
    "-sc_threshold", "0",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    "-f", "hls",
    "-hls_time", "2",
    "-hls_list_size", "0",
    "-hls_segment_type", "mpegts",
    "-hls_segment_filename", segmentPattern,
    playlistPath,
    "-progress", "pipe:1",
  ], { timeout: 300_000 });

  // Parse duration from stderr (ffmpeg prints input info to stderr)
  let totalDurationSec = 0;
  let stderrBuf = "";

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString();
    if (totalDurationSec === 0) {
      const match = stderrBuf.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
      if (match) {
        totalDurationSec =
          parseInt(match[1]) * 3600 +
          parseInt(match[2]) * 60 +
          parseInt(match[3]) +
          parseInt(match[4]) / 100;
      }
    }
  });

  // Parse progress from stdout (-progress pipe:1 outputs key=value lines)
  let stdoutBuf = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() || "";

    for (const line of lines) {
      const match = line.match(/^out_time_ms=(\d+)/);
      if (match && totalDurationSec > 0) {
        const currentSec = parseInt(match[1]) / 1_000_000;
        const progress = Math.min(0.99, currentSec / totalDurationSec);
        notify(uploadId, { status: "transcoding", progress });
      }
    }
  });

  proc.on("error", (err) => {
    const message = err.message.includes("ENOENT")
      ? "ffmpeg not found on PATH. Install ffmpeg to use this demo."
      : `ffmpeg error: ${err.message}`;
    notify(uploadId, { status: "error", progress: 0, message });
  });

  proc.on("close", async (code) => {
    if (code !== 0) {
      const isTimeout = proc.killed;
      const message = isTimeout
        ? "Transcoding took longer than 5 minutes. The source video may be too long or too high-resolution for this demo. Try a shorter clip."
        : `ffmpeg exited with code ${code}`;
      notify(uploadId, { status: "error", progress: 0, message });
      return;
    }

    // Parse the generated m3u8
    try {
      const m3u8Content = await readFile(playlistPath, "utf-8");
      const m3u8Lines = m3u8Content.split("\n");
      const segments: { filename: string; duration: number }[] = [];
      let totalDuration = 0;

      for (let i = 0; i < m3u8Lines.length; i++) {
        const l = m3u8Lines[i].trim();
        if (l.startsWith("#EXTINF:")) {
          const duration = parseFloat(l.replace("#EXTINF:", "").replace(",", ""));
          const filename = m3u8Lines[i + 1]?.trim();
          if (filename && !filename.startsWith("#")) {
            segments.push({ filename, duration });
            totalDuration += duration;
          }
        }
      }

      notify(uploadId, {
        status: "complete",
        progress: 1,
        segments,
        totalDuration,
      });
    } catch (err) {
      notify(uploadId, {
        status: "error",
        progress: 0,
        message: `Failed to parse output: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  });
}
