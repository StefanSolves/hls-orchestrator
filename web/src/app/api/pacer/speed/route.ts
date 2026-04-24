import { NextRequest, NextResponse } from "next/server";
import { getPacer } from "@/lib/pacer";

export async function POST(request: NextRequest) {
  const { speed } = await request.json();
  const pacer = getPacer();
  pacer.setSpeed(speed);
  return NextResponse.json(pacer.status);
}
