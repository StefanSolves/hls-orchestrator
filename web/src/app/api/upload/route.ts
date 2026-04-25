import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { startTranscode } from "@/lib/transcoder";

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

  // Kick off ffmpeg in the background — progress tracked via transcoder store
  startTranscode(uploadId, inputPath, uploadDir);

  return NextResponse.json({ uploadId, status: "transcoding" });
}
