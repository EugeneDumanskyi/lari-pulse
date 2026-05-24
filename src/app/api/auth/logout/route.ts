import { NextResponse } from "next/server";
import { authSessionApi, clearAdminCookie, getSessionFromToken } from "@/lib/auth/access";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({
    status: "ok",
    data: authSessionApi(getSessionFromToken(undefined))
  });

  clearAdminCookie(response);

  return response;
}
