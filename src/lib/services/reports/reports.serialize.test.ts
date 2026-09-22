import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reportContentType, reportDisclaimer, reportFilename, serializeReport } from "./reports.serialize";
import type { ReportDocument, ReportScopePair, ReportSection } from "./reports.types";

/**
 * A fixed document in, an exact string out. Every case asserts the full body
 * rather than a substring, which is what makes these the pinned definition of
 * the three formats.
 */

const btc: ReportScopePair = { symbol: "BTCUSDT", timeframe: "1h" };
const eth: ReportScopePair = { symbol: "ETHUSDT", timeframe: "1h" };

const sections: ReportSection[] = [
  {
    id: "situation",
    title: "Situation",
    category: "market",
    status: "included",
    note: null,
    entries: [
      {
        scope: btc,
        facts: [
          { key: "bias", label: "Bias", value: "bullish" },
          { key: "score", label: "Score", value: "34" }
        ]
      }
    ]
  },
  {
    id: "widgets",
    title: "Widgets",
    category: "market",
    status: "empty",
    note: "No widget result is stored for any of the 1 covered pair.",
    entries: []
  },
  {
    id: "radar",
    title: "Radar",
    category: "market",
    status: "included",
    note: "Ranked pairs are limited to the 1 highest ranking of the 2 covered.",
    entries: [
      {
        scope: null,
        facts: [
          {
            key: "rank-1",
            label: "#1 BTCUSDT 1h",
            value: "bullish, risk moderate, setup 62: Trend strength leads with volume confirming."
          }
        ]
      }
    ]
  },
  {
    id: "portfolio",
    title: "Portfolio",
    category: "personal",
    status: "omitted",
    note: "Portfolio is personal to a signed-in account with the analyst role, so it is not included in this report.",
    entries: []
  }
];

function documentOf(overrides: Partial<ReportDocument> = {}): ReportDocument {
  return {
    generatedAt: "2026-09-22T11:04:00.000Z",
    range: "7d",
    window: { from: "2026-09-15T11:04:00.000Z", to: "2026-09-22T11:04:00.000Z" },
    scope: { symbols: ["BTCUSDT"], timeframes: ["1h"], pairs: [btc] },
    disclaimer: reportDisclaimer,
    header: [
      { key: "generated-at", label: "Generated at", value: "2026-09-22T11:04:00.000Z" },
      { key: "pairs", label: "Pairs", value: "1" }
    ],
    sections,
    ...overrides
  };
}

const expectedMarkdown = `# LariPulse report

${reportDisclaimer}

- Generated at: 2026-09-22T11:04:00.000Z
- Pairs: 1

## Situation

### BTCUSDT 1h

- Bias: bullish
- Score: 34

## Widgets

No widget result is stored for any of the 1 covered pair.

## Radar

Ranked pairs are limited to the 1 highest ranking of the 2 covered.

- #1 BTCUSDT 1h: bullish, risk moderate, setup 62: Trend strength leads with volume confirming.

## Portfolio

Portfolio is personal to a signed-in account with the analyst role, so it is not included in this report.
`;

const expectedCsv =
  "section,scope,key,label,value\r\n" +
  "report,,generated-at,Generated at,2026-09-22T11:04:00.000Z\r\n" +
  "report,,pairs,Pairs,1\r\n" +
  "situation,,status,Status,included\r\n" +
  "situation,BTCUSDT 1h,bias,Bias,bullish\r\n" +
  "situation,BTCUSDT 1h,score,Score,34\r\n" +
  "widgets,,status,Status,empty\r\n" +
  "widgets,,note,Note,No widget result is stored for any of the 1 covered pair.\r\n" +
  "radar,,status,Status,included\r\n" +
  "radar,,note,Note,Ranked pairs are limited to the 1 highest ranking of the 2 covered.\r\n" +
  'radar,,rank-1,#1 BTCUSDT 1h,"bullish, risk moderate, setup 62: Trend strength leads with volume confirming."\r\n' +
  "portfolio,,status,Status,omitted\r\n" +
  // The note holds a comma, so RFC 4180 quotes it.
  'portfolio,,note,Note,"Portfolio is personal to a signed-in account with the analyst role, ' +
  'so it is not included in this report."\r\n';

describe("report markdown", () => {
  it("writes the title, the disclaimer, the header list and every section", () => {
    assert.equal(serializeReport(documentOf(), "markdown"), expectedMarkdown);
  });

  it("ends with exactly one newline", () => {
    const body = serializeReport(documentOf(), "markdown");

    assert.equal(body.endsWith("\n"), true);
    assert.equal(body.endsWith("\n\n"), false);
  });

  it("gives a report-wide entry no scope heading and an unreadable section its note alone", () => {
    const body = serializeReport(documentOf(), "markdown");

    assert.equal(body.includes("### BTCUSDT 1h"), true);
    // Radar's entry is report-wide, so its facts follow the note directly.
    assert.equal(
      body.includes(
        "Ranked pairs are limited to the 1 highest ranking of the 2 covered.\n\n- #1 BTCUSDT 1h:"
      ),
      true
    );
    assert.equal(
      body.endsWith(
        "## Portfolio\n\nPortfolio is personal to a signed-in account with the analyst role, so it is not included in this report.\n"
      ),
      true
    );
  });

  it("renders an empty section's heading and note with no entries", () => {
    assert.equal(
      serializeReport(documentOf(), "markdown").includes(
        "## Widgets\n\nNo widget result is stored for any of the 1 covered pair.\n\n## Radar"
      ),
      true
    );
  });

  it("leaves values unescaped", () => {
    const document = documentOf({
      header: [{ key: "note", label: "Note", value: "a *starred* and _underscored_ summary" }]
    });

    assert.equal(
      serializeReport(document, "markdown").includes("- Note: a *starred* and _underscored_ summary"),
      true
    );
  });
});

describe("report json", () => {
  it("round trips to the same document", () => {
    const document = documentOf();

    assert.deepEqual(JSON.parse(serializeReport(document, "json")), document);
  });

  it("is JSON.stringify with two spaces and no trailing newline", () => {
    const document = documentOf();
    const body = serializeReport(document, "json");

    assert.equal(body, JSON.stringify(document, null, 2));
    assert.equal(body.endsWith("\n"), false);
  });
});

describe("report csv", () => {
  it("writes the header row, the report rows and one row per fact in document order", () => {
    assert.equal(serializeReport(documentOf(), "csv"), expectedCsv);
  });

  it("quotes per RFC 4180 and nothing else", () => {
    const document = documentOf({
      header: [
        { key: "plain", label: "Plain", value: "no special characters" },
        { key: "comma", label: "Comma", value: "bullish, risk moderate" },
        { key: "quote", label: "Quote", value: 'a "quoted" word' },
        { key: "both", label: "Both", value: 'a "quoted", comma value' },
        { key: "newline", label: "Newline", value: "first\nsecond" }
      ],
      sections: []
    });

    assert.equal(
      serializeReport(document, "csv"),
      "section,scope,key,label,value\r\n" +
        "report,,plain,Plain,no special characters\r\n" +
        'report,,comma,Comma,"bullish, risk moderate"\r\n' +
        'report,,quote,Quote,"a ""quoted"" word"\r\n' +
        'report,,both,Both,"a ""quoted"", comma value"\r\n' +
        'report,,newline,Newline,"first\nsecond"\r\n'
    );
  });

  it("ends every row with CRLF and writes no byte order mark", () => {
    const body = serializeReport(documentOf(), "csv");

    assert.equal(body.charAt(0), "s");
    assert.equal(body.codePointAt(0), 115);
    assert.equal(body.endsWith("\r\n"), true);

    for (const row of body.split("\r\n").slice(0, -1)) {
      assert.equal(row.includes("\r"), false);
    }
  });
});

describe("report filename and content type", () => {
  it("derives the stamp from generatedAt and carries the extension per format", () => {
    const document = documentOf();

    assert.equal(reportFilename(document, "markdown"), "laripulse-report-BTCUSDT-1h-20260922T110400Z.md");
    assert.equal(reportFilename(document, "json"), "laripulse-report-BTCUSDT-1h-20260922T110400Z.json");
    assert.equal(reportFilename(document, "csv"), "laripulse-report-BTCUSDT-1h-20260922T110400Z.csv");
  });

  it("carries the pair only when the scope is exactly one pair", () => {
    const twoSymbols = documentOf({
      scope: { symbols: ["BTCUSDT", "ETHUSDT"], timeframes: ["1h"], pairs: [btc, eth] }
    });
    const twoTimeframes = documentOf({
      scope: {
        symbols: ["BTCUSDT"],
        timeframes: ["1h", "4h"],
        pairs: [btc, { symbol: "BTCUSDT", timeframe: "4h" }]
      }
    });

    assert.equal(reportFilename(twoSymbols, "markdown"), "laripulse-report-20260922T110400Z.md");
    assert.equal(reportFilename(twoTimeframes, "markdown"), "laripulse-report-20260922T110400Z.md");
  });

  it("returns the three pinned content types", () => {
    assert.equal(reportContentType("markdown"), "text/markdown; charset=utf-8");
    assert.equal(reportContentType("json"), "application/json; charset=utf-8");
    assert.equal(reportContentType("csv"), "text/csv; charset=utf-8");
  });
});

describe("report serialization determinism", () => {
  it("produces identical strings for the same document in every format", () => {
    for (const format of ["markdown", "json", "csv"] as const) {
      assert.equal(serializeReport(documentOf(), format), serializeReport(documentOf(), format));
    }
  });
});
