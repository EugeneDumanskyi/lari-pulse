import type { ReportDocument, ReportFormat } from "./reports.types";

/**
 * Document in, string out. This module imports no database client, no session
 * type, no clock and no other service, so every byte of every format is
 * testable on a fixed document the way an indicator is.
 *
 * It formats nothing. Every `value` is already a string when it arrives, and
 * the serializers assume nothing about it — the CSV writer still quotes a
 * newline correctly, because its contract is the `ReportDocument` type rather
 * than what the composition happens to produce.
 */

/** Verbatim from the Disclaimer section of `README.md`. */
export const reportDisclaimer =
  "LariPulse produces analytical summaries of available market data. It is not financial advice, does not give buy or sell instructions, and does not guarantee future performance.";

const contentTypes: Record<ReportFormat, string> = {
  markdown: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8"
};

const extensions: Record<ReportFormat, string> = {
  markdown: "md",
  json: "json",
  csv: "csv"
};

export function reportContentType(format: ReportFormat) {
  return contentTypes[format];
}

function scopeLabel(pair: { symbol: string; timeframe: string }) {
  return `${pair.symbol} ${pair.timeframe}`;
}

/**
 * Every block below is separated by exactly one blank line, so the document is
 * built as a block list and joined rather than pushed line by line — that is
 * what keeps a section with no entries from leaving a double blank behind it.
 */
function serializeMarkdown(document: ReportDocument) {
  const blocks: string[] = ["# LariPulse report", document.disclaimer];

  if (document.header.length > 0) {
    blocks.push(document.header.map((fact) => `- ${fact.label}: ${fact.value}`).join("\n"));
  }

  for (const section of document.sections) {
    blocks.push(`## ${section.title}`);

    if (section.note !== null) {
      blocks.push(section.note);
    }

    for (const entry of section.entries) {
      if (entry.scope !== null) {
        blocks.push(`### ${scopeLabel(entry.scope)}`);
      }

      if (entry.facts.length > 0) {
        blocks.push(entry.facts.map((fact) => `- ${fact.label}: ${fact.value}`).join("\n"));
      }
    }
  }

  return `${blocks.join("\n\n")}\n`;
}

/** RFC 4180: quote only on a comma, a double quote, a CR or an LF. */
function csvField(value: string) {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function csvRow(cells: string[]) {
  return `${cells.map(csvField).join(",")}\r\n`;
}

function serializeCsv(document: ReportDocument) {
  let out = csvRow(["section", "scope", "key", "label", "value"]);

  for (const fact of document.header) {
    out += csvRow(["report", "", fact.key, fact.label, fact.value]);
  }

  for (const section of document.sections) {
    out += csvRow([section.id, "", "status", "Status", section.status]);

    if (section.note !== null) {
      out += csvRow([section.id, "", "note", "Note", section.note]);
    }

    for (const entry of section.entries) {
      for (const fact of entry.facts) {
        out += csvRow([section.id, entry.scope === null ? "" : scopeLabel(entry.scope), fact.key, fact.label, fact.value]);
      }
    }
  }

  return out;
}

export function serializeReport(document: ReportDocument, format: ReportFormat) {
  if (format === "json") {
    // No trailing newline, so `JSON.parse(body)` deep-equals the same call's
    // `document` and the string equals `JSON.stringify(document, null, 2)`.
    return JSON.stringify(document, null, 2);
  }

  if (format === "csv") {
    return serializeCsv(document);
  }

  return serializeMarkdown(document);
}

/**
 * Every part is ASCII by construction — symbols come from `appConfig.symbols`,
 * timeframes from `collectionTimeframes`, the stamp from an ISO string and the
 * extension from a three-value union — so the `Content-Disposition` header
 * needs no `filename*` encoding and no quote escaping.
 */
export function reportFilename(document: ReportDocument, format: ReportFormat) {
  const stamp = document.generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  // A folder of single-pair reports is unreadable without the pair; at two
  // pairs or more a list of symbols in a filename is worse than none.
  const pair =
    document.scope.pairs.length === 1
      ? `${document.scope.pairs[0].symbol}-${document.scope.pairs[0].timeframe}-`
      : "";

  return `laripulse-report-${pair}${stamp}.${extensions[format]}`;
}
