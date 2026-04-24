import { NextRequest, NextResponse } from "next/server";
import { getPacer } from "@/lib/pacer";

export async function POST(request: NextRequest) {
  const pacer = getPacer();

  // If body has upload info, load it first
  try {
    const body = await request.json();
    if (body.uploadId && body.segments) {
      pacer.load(body.uploadId, body.segments);
    }
  } catch {
    // No body or invalid JSON — just start with existing state
  }

  pacer.start();
  return NextResponse.json(pacer.status);
}
