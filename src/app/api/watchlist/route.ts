import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import {
  createWatchlistItemForSession,
  getWatchlistContext,
  type WatchlistItemInput
} from "@/lib/services/watchlistContextService";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    return okJson(getWatchlistContext({ session }));
  } catch (error) {
    return apiErrorJson(error, "Unable to load watchlist context");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const input = (await request.json()) as WatchlistItemInput;
    createWatchlistItemForSession({ session, input });

    return okJson(getWatchlistContext({ session }), { status: 201 });
  } catch (error) {
    return apiErrorJson(error, "Unable to add watchlist item");
  }
}
