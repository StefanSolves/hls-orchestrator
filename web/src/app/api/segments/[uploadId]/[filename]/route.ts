import { NextRequest } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";
import { tmpdir } from "os";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ uploadId: string; filename: string }> }
) {
  const { uploadId, filename } = await params;

  // Sanitize: only allow alphanumeric, hyphens, dots in filename
  if (!/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes("..")) {
    return new Response("Invalid filename", { status: 400 });
  }
  if (!/^[a-f0-9-]+$/.test(uploadId)) {
    return new Response("Invalid uploadId", { status: 400 });
  }

  const filePath = path.join(tmpdir(), "hls-demo-uploads", uploadId, filename);

  try {
    await stat(filePath);
  } catch {
    return new Response("Segment not found", { status: 404 });
  }

  const data = await readFile(filePath);
  return new Response(data, {
    headers: {
      "Content-Type": "video/mp2t",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
