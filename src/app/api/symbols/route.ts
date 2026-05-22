import { apiErrorJson, okJson } from "@/lib/services/apiResponses";
import { listSymbols } from "@/lib/services/symbolService";

export const runtime = "nodejs";

export async function GET() {
  try {
    const symbols = listSymbols();

    return okJson({
      symbols,
      count: symbols.length
    });
  } catch (error) {
    return apiErrorJson(error, "Unable to load symbols");
  }
}
