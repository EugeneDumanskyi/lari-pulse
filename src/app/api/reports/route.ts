import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { generateReportFor } from "./reportParams";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const generated = await generateReportFor(request.nextUrl.searchParams, getSessionFromRequest(request));

    return okJson(generated);
  } catch (error) {
    return apiErrorJson(error, "Unable to generate report");
  }
}
