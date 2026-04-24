import { NextResponse } from "next/server";
import { getPacer } from "@/lib/pacer";

export async function POST() {
  const pacer = getPacer();
  pacer.resume();
  return NextResponse.json(pacer.status);
}
