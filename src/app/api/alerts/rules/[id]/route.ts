import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { okJson, apiErrorJson } from "@/lib/services/apiResponses";
import {
  deleteRuleForSession,
  updateRuleForSession,
  type AlertRuleInput
} from "@/lib/services/alertService";
import {
  ApiInputError,
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";

export const runtime = "nodejs";

function parseId(value: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id < 1) {
    throw new ApiInputError("Invalid alert rule id");
  }

  return id;
}

function normalizePatch(input: Partial<AlertRuleInput>, session: ReturnType<typeof getSessionFromRequest>) {
  const patch = { ...input };

  if (input.symbol) {
    patch.symbol = validateSymbol(input.symbol);
    validateSymbolAccess(patch.symbol, session);
  }

  if (input.timeframe) {
    patch.timeframe = validateOptionalTimeframe(input.timeframe);
  }

  return patch;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    const input = (await request.json()) as Partial<AlertRuleInput>;
    const rule = updateRuleForSession({
      session,
      id: parseId(id),
      input: normalizePatch(input, session)
    });

    return okJson(rule);
  } catch (error) {
    return apiErrorJson(error, "Unable to update alert rule");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSessionFromRequest(request);
    const { id } = await params;
    deleteRuleForSession({
      session,
      id: parseId(id)
    });

    return okJson({ deleted: true });
  } catch (error) {
    return apiErrorJson(error, "Unable to delete alert rule");
  }
}
