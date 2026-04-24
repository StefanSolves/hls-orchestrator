import { NextRequest, NextResponse } from "next/server";
import { getPacer } from "@/lib/pacer";

export async function POST(request: NextRequest) {
  const { enabled } = await request.json();
  const pacer = getPacer();
  pacer.setChaos(enabled);
  return NextResponse.json(pacer.status);
}
