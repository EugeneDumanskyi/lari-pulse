import type { AuthSession } from "@/lib/auth/access";
import { validateOptionalRange } from "@/lib/services/apiValidation";
import type { InsightRange } from "@/lib/services/insights/insights.types";
import { generateReport } from "@/lib/services/reports/reports.service";
import type { ReportFormat, ReportSectionId } from "@/lib/services/reports/reports.types";

/**
 * The two report routes take the same five parameters and make the same one
 * service call; they differ only in how they return what it produced. The
 * parsing lives here so neither route owns a second copy of it, and every
 * value is validated inside `generateReport` against its closed union.
 */

function parseCsvParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

export function reportRequest(params: URLSearchParams, session: AuthSession) {
  return {
    session,
    symbols: parseCsvParam(params.get("symbols")),
    timeframes: parseCsvParam(params.get("timeframes")),
    // `validateOptionalRange` already closes the vocabulary at the four
    // values, so this is a narrowing rather than a widening of what it allows.
    range: validateOptionalRange(params.get("range")) as InsightRange | undefined,
    sections: parseCsvParam(params.get("sections")) as ReportSectionId[] | undefined,
    format: (params.get("format")?.trim() || undefined) as ReportFormat | undefined
  };
}

export function generateReportFor(params: URLSearchParams, session: AuthSession) {
  return generateReport(reportRequest(params, session));
}
