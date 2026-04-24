import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getPacer } from "@/lib/pacer";
import type { PlaylistJson } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = getConfig();
  const pacer = getPacer();
  const status = pacer.status;
  const streamId = status.streamId;

  if (!streamId) {
    return NextResponse.json({ error: "No active stream" }, { status: 404 });
  }

  const url = `${config.orchestratorUrl}/streams/${streamId}/renditions/${config.rendition}/playlist.m3u8`;

  let raw: string;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Orchestrator returned ${res.status}` },
        { status: res.status }
      );
    }
    raw = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach orchestrator" },
      { status: 502 }
    );
  }

  const format = request.nextUrl.searchParams.get("format");

  if (format === "json") {
    const lines = raw.split("\n");
    let version = 3;
    let targetDuration = 2;
    let mediaSequence = 0;
    let ended = false;
    const segments: PlaylistJson["segments"] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#EXT-X-VERSION:")) {
        version = parseInt(line.split(":")[1], 10);
      } else if (line.startsWith("#EXT-X-TARGETDURATION:")) {
        targetDuration = parseInt(line.split(":")[1], 10);
      } else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
        mediaSequence = parseInt(line.split(":")[1], 10);
      } else if (line === "#EXT-X-ENDLIST") {
        ended = true;
      } else if (line.startsWith("#EXTINF:")) {
        const duration = parseFloat(line.replace("#EXTINF:", "").replace(",", ""));
        const path = lines[i + 1]?.trim();
        if (path && !path.startsWith("#")) {
          segments.push({
            sequence: mediaSequence + segments.length,
            duration,
            path,
          });
        }
      }
    }

    const result: PlaylistJson = { raw, version, targetDuration, mediaSequence, segments, ended };
    return NextResponse.json(result);
  }

  return new Response(raw, {
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Cache-Control": "no-cache, no-store",
    },
  });
}
