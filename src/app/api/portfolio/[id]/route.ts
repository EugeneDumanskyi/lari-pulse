import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { ApiInputError } from "@/lib/services/apiValidation";
import {
  deletePortfolioItemForSession,
  getPortfolioContext,
  updatePortfolioItemForSession,
  type PortfolioItemInput
} from "@/lib/services/portfolioContextService";

export const runtime = "nodejs";

function parseId(value: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiInputError("Invalid portfolio item id");
  }

  return id;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    const input = (await request.json()) as Partial<PortfolioItemInput>;
    updatePortfolioItemForSession({
      session,
      id: parseId(id),
      input
    });

    return okJson(getPortfolioContext({ session }));
  } catch (error) {
    return apiErrorJson(error, "Unable to update portfolio item");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    deletePortfolioItemForSession({
      session,
      id: parseId(id)
    });

    return okJson(getPortfolioContext({ session }));
  } catch (error) {
    return apiErrorJson(error, "Unable to delete portfolio item");
  }
}
