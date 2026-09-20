import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { parseRouteId } from "@/lib/services/apiValidation";
import {
  deleteWatchlistItemForSession,
  getWatchlistContext,
  updateWatchlistItemForSession,
  type WatchlistItemPatch
} from "@/lib/services/watchlistContextService";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    const input = (await request.json()) as WatchlistItemPatch;
    updateWatchlistItemForSession({
      session,
      id: parseRouteId(id, "watchlist item id"),
      input
    });

    return okJson(getWatchlistContext({ session }));
  } catch (error) {
    return apiErrorJson(error, "Unable to update watchlist item");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    deleteWatchlistItemForSession({
      session,
      id: parseRouteId(id, "watchlist item id")
    });

    return okJson(getWatchlistContext({ session }));
  } catch (error) {
    return apiErrorJson(error, "Unable to remove watchlist item");
  }
}
