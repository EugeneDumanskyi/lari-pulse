import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson } from "@/lib/services/apiResponses";
import { generateReportFor } from "../reportParams";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const generated = await generateReportFor(request.nextUrl.searchParams, getSessionFromRequest(request));

    /*
     * The one unwrapped success response in the app. A downloaded
     * `{ status, data: { body } }` is not a report, it is a JSON file
     * containing one with every newline escaped, so the serialized body is the
     * whole response and a client checks the status code rather than the
     * shape. Failures below still go through `apiErrorJson` and stay wrapped.
     *
     * `no-store` because a report can carry one user's holdings and alert
     * events, and a reverse proxy is assumed.
     */
    return new NextResponse(generated.body, {
      status: 200,
      headers: {
        "Content-Type": generated.contentType,
        "Content-Disposition": `attachment; filename="${generated.filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiErrorJson(error, "Unable to generate report");
  }
}
