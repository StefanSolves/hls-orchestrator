import { NextResponse } from "next/server";
import { getPacer } from "@/lib/pacer";

export async function POST() {
  const pacer = getPacer();
  await pacer.end();
  return NextResponse.json(pacer.status);
}
