import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  createPortfolioItemForSession,
  getPortfolioContext,
  type PortfolioItemInput
} from "@/lib/services/portfolioContextService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    return okJson(getPortfolioContext({ session }));
  } catch (error) {
    return apiErrorJson(error, "Unable to load portfolio context");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const input = (await request.json()) as PortfolioItemInput;
    createPortfolioItemForSession({ session, input });

    return okJson(getPortfolioContext({ session }), { status: 201 });
  } catch (error) {
    return apiErrorJson(error, "Unable to create portfolio item");
  }
}
