import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { okJson, apiErrorJson } from "@/lib/services/apiResponses";
import { acknowledgeEventForSession } from "@/lib/services/alertService";
import { ApiInputError } from "@/lib/services/apiValidation";

export const runtime = "nodejs";

function parseId(value: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiInputError("Invalid alert event id");
  }

  return id;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    const event = acknowledgeEventForSession({
      session,
      id: parseId(id)
    });

    return okJson(event);
  } catch (error) {
    return apiErrorJson(error, "Unable to acknowledge alert event");
  }
}
