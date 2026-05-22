import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    app: "laripulse",
    phase: "phase1",
    timestamp: new Date().toISOString()
  });
}
