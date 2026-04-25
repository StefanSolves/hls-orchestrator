import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import path from "path";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("video") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No video file provided" }, { status: 400 });
  }

  const uploadId = randomUUID();
  const uploadDir = path.join(tmpdir(), "hls-demo-uploads", uploadId);
  await mkdir(uploadDir, { recursive: true });

  // Write uploaded file to disk
  const inputPath = path.join(uploadDir, "input" + path.extname(file.name || "video.mp4"));
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(inputPath, buffer);

  // Run ffmpeg
  const segmentPattern = path.join(uploadDir, "seg%d.ts");
  const playlistPath = path.join(uploadDir, "index.m3u8");

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-i", inputPath,
      // Downscale sources above 1080p to keep transcode time reasonable.
      // No-op for sources ≤1920px wide. Height auto-computed, rounded to even.
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
    ], { timeout: 300_000 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ffmpeg failed";
    if (message.includes("ENOENT")) {
      return NextResponse.json(
        { error: "ffmpeg not found on PATH. Install ffmpeg to use this demo." },
        { status: 500 }
      );
    }
    // Node kills the process on timeout and sets err.killed = true
    const isTimeout = err instanceof Error && "killed" in err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed;
    if (isTimeout) {
      return NextResponse.json(
        { error: "Transcoding took longer than 5 minutes. The source video may be too long or too high-resolution for this demo. Try a shorter clip." },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: `ffmpeg error: ${message}` }, { status: 500 });
  }

  // Parse the generated m3u8 to extract segment list
  const m3u8Content = await readFile(playlistPath, "utf-8");
  const lines = m3u8Content.split("\n");
  const segments: { filename: string; duration: number }[] = [];
  let totalDuration = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      const duration = parseFloat(line.replace("#EXTINF:", "").replace(",", ""));
      const filename = lines[i + 1]?.trim();
      if (filename && !filename.startsWith("#")) {
        segments.push({ filename, duration });
        totalDuration += duration;
      }
    }
  }

  return NextResponse.json({
    uploadId,
    segments,
    totalDuration,
  });
}
