import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/access";
import { okJson, apiErrorJson } from "@/lib/services/apiResponses";
import {
  createRuleForSession,
  listRulesForSession,
  type AlertRuleInput
} from "@/lib/services/alertService";
import {
  validateOptionalTimeframe,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";

export const runtime = "nodejs";

function normalizeRuleInput(input: AlertRuleInput, session: ReturnType<typeof getSessionFromRequest>) {
  const symbol = validateSymbol(input.symbol);
  validateSymbolAccess(symbol, session);
  const timeframe = validateOptionalTimeframe(input.timeframe) ?? "1h";

  return {
    ...input,
    symbol,
    timeframe
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    return okJson(listRulesForSession({ session }));
  } catch (error) {
    return apiErrorJson(error, "Unable to load alert rules");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSessionFromRequest(request);
    const input = (await request.json()) as AlertRuleInput;
    const rule = createRuleForSession({
      session,
      input: normalizeRuleInput(input, session)
    });

    return okJson(rule, { status: 201 });
  } catch (error) {
    return apiErrorJson(error, "Unable to create alert rule");
  }
}
