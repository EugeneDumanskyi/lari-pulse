import type Database from "better-sqlite3";
import {
  canAccessSymbol,
  filterVisibleWidgetResults,
  hasRole,
  requireRole,
  type AuthSession
} from "@/lib/auth/access";
import type { WidgetResultApi } from "@/lib/api/types";
import { appConfig } from "@/lib/config/appConfig";
import { collectionTimeframes } from "@/lib/config/timeframes";
import { getDatabase } from "@/lib/db/client";
import { initializeDatabase } from "@/lib/db/initialize";
import { getWidgetCatalogItem } from "@/lib/widgets/catalog";
import { listEventsForSession, type AlertEventApi } from "@/lib/services/alertService";
import {
  ApiInputError,
  validateCollectionTimeframe,
  validateOptionalRange,
  validateSymbol,
  validateSymbolAccess
} from "@/lib/services/apiValidation";
import { getInsights, windowForRange } from "@/lib/services/insights/insights.service";
import type { InsightRange, InsightsResponse } from "@/lib/services/insights/insights.types";
import { getOpportunityRadar } from "@/lib/services/opportunityRadarService";
import { getPortfolioContext, type PortfolioContextApi } from "@/lib/services/portfolioContextService";
import {
  defaultSituationTimeframe,
  getSituationOverview
} from "@/lib/services/situationOverview/situationOverview.service";
import type { SituationDriver, SituationOverview } from "@/lib/services/situationOverview/situationOverview.types";
import { listLatestWidgetResultsWithDerivedLiquidity } from "@/lib/services/widgetResultService";
import { reportContentType, reportFilename, reportDisclaimer, serializeReport } from "./reports.serialize";
import type {
  BuildReportDocumentInput,
  GeneratedReport,
  ReportDocument,
  ReportEntry,
  ReportFact,
  ReportFormat,
  ReportScope,
  ReportScopePair,
  ReportSection,
  ReportSectionCategory,
  ReportSectionId,
  ReportSectionStatus
} from "./reports.types";

/**
 * Twenty-four is eight times today's default scope and twice the full
 * configured cross product. Over it the request is rejected rather than
 * truncated: a report is a document someone keeps and hands on, and the second
 * reader has no page to go back to, so a silently short report is worse than a
 * rejected request.
 */
export const maxReportPairs = 24;

/** The limit passed to `listEventsForSession`; Reports adds no cap of its own. */
export const maxReportAlertEvents = 500;

const defaultRange: InsightRange = "7d";
const defaultFormat: ReportFormat = "markdown";

const sectionIds: ReportSectionId[] = ["situation", "widgets", "insights", "radar", "portfolio", "alerts"];
const reportFormats: ReportFormat[] = ["markdown", "json", "csv"];

const sectionTitles: Record<ReportSectionId, string> = {
  situation: "Situation",
  widgets: "Widgets",
  insights: "Insights",
  radar: "Radar",
  portfolio: "Portfolio",
  alerts: "Alerts"
};

const sectionCategories: Record<ReportSectionId, ReportSectionCategory> = {
  situation: "market",
  widgets: "market",
  insights: "market",
  radar: "market",
  portfolio: "personal",
  alerts: "personal"
};

/**
 * One template covers both the anonymous and the under-privileged case. A
 * message that distinguished them would tell a viewer which role they lack,
 * which is a small disclosure about the instance in return for nothing the
 * caller can act on.
 */
const omittedNotes: Partial<Record<ReportSectionId, string>> = {
  portfolio:
    "Portfolio is personal to a signed-in account with the analyst role, so it is not included in this report.",
  alerts:
    "Alert activity is personal to a signed-in account with the analyst role, so it is not included in this report."
};

/**
 * `WidgetResultApi.confidence` is a number and a report renders a word, on the
 * cut-offs the dashboard's own `confidenceLabel` uses, lowercased to match the
 * bias and risk words beside it.
 */
const highConfidence = 0.74;
const mediumConfidence = 0.5;

function confidenceWord(confidence: number) {
  if (confidence >= highConfidence) {
    return "high";
  }

  return confidence >= mediumConfidence ? "medium" : "low";
}

/** `strong_bullish` reads as `strong bullish`, the way Insights renders it. */
function words(value: string) {
  return value.replaceAll("_", " ");
}

/** No value a report carries is multi-line, whatever a widget summary holds. */
function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, " ");
}

function integer(value: number) {
  return String(Math.round(value));
}

function decimals(value: number, places: number) {
  return value.toFixed(places);
}

function fact(key: string, label: string, value: string): ReportFact {
  return { key, label, value: oneLine(value) };
}

function driverList(drivers: SituationDriver[]) {
  if (drivers.length === 0) {
    return "none";
  }

  return drivers.map((driver) => `${driver.label} holding ${words(driver.direction)}`).join("; ");
}

function section(
  id: ReportSectionId,
  status: ReportSectionStatus,
  note: string | null,
  entries: ReportEntry[]
): ReportSection {
  return {
    id,
    title: sectionTitles[id],
    category: sectionCategories[id],
    status,
    note,
    // An omitted or empty section carries no entry, rather than a missing key.
    entries: status === "included" ? entries : []
  };
}

function omitted(id: ReportSectionId): ReportSection {
  return section(id, "omitted", omittedNotes[id] ?? null, []);
}

function situationSection(input: BuildReportDocumentInput): ReportSection {
  const entries = (input.situation ?? []).map(({ pair, overview }) => ({
    scope: pair,
    facts: situationFacts(overview)
  }));

  // An overview is built for every covered pair, including one with nothing
  // stored — that pair reports an unknown state rather than being dropped.
  return section("situation", "included", null, entries);
}

function situationFacts(overview: SituationOverview): ReportFact[] {
  return [
    fact("bias", "Bias", words(overview.bias)),
    fact("risk-level", "Risk level", words(overview.riskLevel)),
    fact("confidence", "Confidence", words(overview.confidence)),
    fact("score", "Score", integer(overview.score)),
    fact("risk-score", "Risk score", integer(overview.riskScore)),
    fact("main-drivers", "Main drivers", driverList(overview.mainDrivers)),
    fact("conflicting-signals", "Conflicting signals", driverList(overview.conflictingSignals)),
    fact(
      "watch-conditions",
      "Watch conditions",
      overview.watchConditions.length === 0
        ? "none"
        : overview.watchConditions
            .map((condition) => `${condition.label} at ${condition.severity} severity`)
            .join("; ")
    ),
    fact("generated-at", "Generated at", overview.generatedAt)
  ];
}

function widgetFacts(results: WidgetResultApi[]): ReportFact[] {
  if (results.length === 0) {
    return [fact("no-results", "Widgets", "Nothing has been collected for this pair.")];
  }

  return results.map((result) =>
    fact(
      result.widgetId,
      getWidgetCatalogItem(result.widgetId)?.title ?? words(result.widgetId),
      `${words(result.direction)}, score ${integer(result.score)}, confidence ${confidenceWord(result.confidence)}: ${result.summary}`
    )
  );
}

function widgetsSection(input: BuildReportDocumentInput): ReportSection {
  const material = input.widgets ?? [];
  const stored = material.filter((entry) => entry.results.length > 0);

  if (stored.length === 0) {
    return section(
      "widgets",
      "empty",
      `No widget result is stored for any of the ${input.scope.pairs.length} covered ${input.scope.pairs.length === 1 ? "pair" : "pairs"}.`,
      []
    );
  }

  return section(
    "widgets",
    "included",
    null,
    material.map(({ pair, results }) => ({ scope: pair, facts: widgetFacts(results) }))
  );
}

function insightsFacts(response: InsightsResponse): ReportFact[] {
  return [
    fact("snapshots", "Snapshots", String(response.snapshotCount)),
    fact(
      "covered-window",
      "Covered window",
      response.coveredWindow === null
        ? "none"
        : `${response.coveredWindow.from} to ${response.coveredWindow.to}`
    ),
    // `alert-activity` is dropped: this report has its own `alerts` section
    // reading the same events over the same window, and carrying both would
    // put the same rows in one document twice.
    ...response.sections
      .filter((carried) => carried.id !== "alert-activity")
      .map((carried) => fact(carried.id, carried.title, carried.lines.map((line) => line.text).join(" ")))
  ];
}

function insightsSection(input: BuildReportDocumentInput): ReportSection {
  return section(
    "insights",
    "included",
    null,
    (input.insights ?? []).map(({ pair, response }) => ({ scope: pair, facts: insightsFacts(response) }))
  );
}

function radarSection(input: BuildReportDocumentInput): ReportSection {
  const radar = input.radar;
  const covered = input.scope.pairs.length;

  if (radar === null || radar.items.length === 0) {
    return section("radar", "empty", "No pair in this scope produced a ranked item.", []);
  }

  // The report exposes no radar limit, so the note is the only place the
  // default 20 is visible.
  const note =
    radar.items.length < covered
      ? `Ranked pairs are limited to the ${radar.items.length} highest ranking of the ${covered} covered.`
      : null;

  return section("radar", "included", note, [
    {
      scope: null,
      facts: radar.items.map((item) =>
        fact(
          `rank-${item.rank}`,
          `#${item.rank} ${item.symbol} ${item.timeframe}`,
          `${words(item.bias)}, risk ${words(item.riskLevel)}, setup ${integer(item.setupScore)}: ${item.primaryReason}`
        )
      )
    }
  ]);
}

function portfolioFacts(portfolio: PortfolioContextApi): ReportFact[] {
  const summary = portfolio.summary;

  return [
    fact("holdings", "Holdings", String(summary.itemCount)),
    fact("risk-included", "Included in risk", String(summary.riskIncludedCount)),
    fact("total-market-value", "Total market value", decimals(summary.totalMarketValue, 2)),
    fact(
      "unrealized-pnl",
      "Unrealized profit and loss",
      summary.totalUnrealizedPnl === null
        ? "none"
        : `${decimals(summary.totalUnrealizedPnl, 2)}${
            summary.totalUnrealizedPnlPercent === null
              ? ""
              : ` (${decimals(summary.totalUnrealizedPnlPercent, 2)}%)`
          }`
    ),
    fact(
      "largest-holding",
      "Largest holding",
      summary.largestHolding === null
        ? "none"
        : `${summary.largestHolding.symbol} at ${decimals(summary.largestHolding.concentrationPercent, 2)}% of market value`
    ),
    fact(
      "highest-risk-holding",
      "Highest risk holding",
      summary.highestRisk === null
        ? "none"
        : `${summary.highestRisk.symbol}, risk ${words(summary.highestRisk.riskLevel)}`
    ),
    ...portfolio.items.map((item) =>
      fact(
        `holding-${item.symbol}`,
        item.symbol,
        `${decimals(item.quantity, 4)} ${item.symbol}, market value ${
          item.marketValue === null ? "unknown" : `${decimals(item.marketValue, 2)} ${item.quoteCurrency}`
        }`
      )
    )
  ];
}

function portfolioSection(input: BuildReportDocumentInput): ReportSection {
  const portfolio = input.portfolio;

  if (portfolio === null) {
    return omitted("portfolio");
  }

  if (portfolio.summary.itemCount === 0) {
    return section("portfolio", "empty", "This account holds no portfolio items.", []);
  }

  return section("portfolio", "included", null, [{ scope: null, facts: portfolioFacts(portfolio) }]);
}

function alertsFacts(events: AlertEventApi[]): ReportFact[] {
  return [
    fact("events-in-window", "Events in window", String(events.length)),
    fact(
      "acknowledged",
      "Acknowledged",
      String(events.filter((event) => event.acknowledgedAt !== null).length)
    ),
    // The read answers newest-first; a document reads forward in time.
    ...[...events].reverse().map((event) =>
      fact(
        `event-${event.id}`,
        `${event.createdAt} ${event.severity}`,
        `${event.symbol} ${event.timeframe}: ${event.title}`
      )
    )
  ];
}

function alertsSection(input: BuildReportDocumentInput): ReportSection {
  const alerts = input.alerts;

  if (alerts === null) {
    return omitted("alerts");
  }

  // The read is newest-first and the window's upper bound is `now`, so the 500
  // newest are a superset of the in-window set — until exactly 500 came back,
  // at which point the superset argument no longer holds and the note says so.
  const truncationNote = alerts.truncated
    ? `The newest ${maxReportAlertEvents} alert events were read, so older events inside this window may be missing.`
    : null;

  if (alerts.events.length === 0) {
    return section(
      "alerts",
      "empty",
      truncationNote ?? "No alert event was recorded for this account inside the window.",
      []
    );
  }

  return section("alerts", "included", truncationNote, [{ scope: null, facts: alertsFacts(alerts.events) }]);
}

const sectionBuilders: Record<ReportSectionId, (input: BuildReportDocumentInput) => ReportSection> = {
  situation: situationSection,
  widgets: widgetsSection,
  insights: insightsSection,
  radar: radarSection,
  portfolio: portfolioSection,
  alerts: alertsSection
};

/**
 * Pure: already-fetched material in, a document out. No database, no session,
 * no network and no clock — `now` arrives in the input. Every label, every
 * value format and every note is decided here, so the whole document is
 * testable without seeding a database twice.
 */
export function buildReportDocument(input: BuildReportDocumentInput): ReportDocument {
  const requested = new Set(input.sections);

  return {
    generatedAt: input.now.toISOString(),
    range: input.range,
    window: input.window,
    scope: input.scope,
    disclaimer: reportDisclaimer,
    header: [
      fact("generated-at", "Generated at", input.now.toISOString()),
      fact("window", "Window", `${input.window.from} to ${input.window.to} (${input.range})`),
      fact("symbols", "Symbols", input.scope.symbols.join(", ")),
      fact("timeframes", "Timeframes", input.scope.timeframes.join(", ")),
      fact("pairs", "Pairs", String(input.scope.pairs.length))
    ],
    // Display order, which is not the composition order. A section not
    // requested is absent from the document entirely.
    sections: sectionIds.filter((id) => requested.has(id)).map((id) => sectionBuilders[id](input))
  };
}

export interface GenerateReportOptions {
  session: AuthSession;
  symbols?: string[];
  timeframes?: string[];
  range?: InsightRange;
  sections?: ReportSectionId[];
  format?: ReportFormat;
  db?: Database.Database;
  now?: Date;
}

function normalizeSymbols(session: AuthSession, symbols?: string[]) {
  if (symbols && symbols.length > 0) {
    // `validateSymbol` rejects an unknown or inactive symbol and
    // `validateSymbolAccess` one this session may not read; neither alone
    // covers both. A symbol outside the session's reach is a 400 rather than
    // an empty section, so a report cannot probe for stored state.
    return unique(symbols.map((symbol) => validateSymbolAccess(validateSymbol(symbol), session)));
  }

  return appConfig.symbols
    .filter((symbol) => symbol.isActive && canAccessSymbol(session, symbol.symbol))
    .map((symbol) => symbol.symbol);
}

function normalizeTimeframes(timeframes?: string[]) {
  if (timeframes && timeframes.length > 0) {
    return unique(timeframes.map((timeframe) => validateCollectionTimeframe(timeframe)));
  }

  // Deliberately not Radar's default of all four collection timeframes, which
  // would make a default report four documents' worth of content.
  return [defaultSituationTimeframe()];
}

function normalizeSections(sections?: ReportSectionId[]) {
  if (!sections || sections.length === 0) {
    return [...sectionIds];
  }

  for (const id of sections) {
    if (!sectionIds.includes(id)) {
      throw new ApiInputError(`Unsupported report section: ${id}`);
    }
  }

  // Duplicates collapse and the parameter's order is ignored: display order is
  // fixed in `buildReportDocument`.
  return sectionIds.filter((id) => sections.includes(id));
}

function normalizeFormat(format?: ReportFormat) {
  if (format === undefined) {
    return defaultFormat;
  }

  if (!reportFormats.includes(format)) {
    throw new ApiInputError(`Unsupported report format: ${format}`);
  }

  return format;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function buildScope(symbols: string[], timeframes: string[]): ReportScope {
  const orderedSymbols = appConfig.symbols
    .map((symbol) => symbol.symbol)
    .filter((symbol) => symbols.includes(symbol));
  const orderedTimeframes = collectionTimeframes.filter((timeframe) => timeframes.includes(timeframe));
  const pairs: ReportScopePair[] = [];

  for (const symbol of orderedSymbols) {
    for (const timeframe of orderedTimeframes) {
      pairs.push({ symbol, timeframe });
    }
  }

  return { symbols: orderedSymbols, timeframes: [...orderedTimeframes], pairs };
}

/** `${stored} ` is UTC with a space separator, and parses as local without this. */
function toIsoTimestamp(stored: string) {
  return `${stored.replace(" ", "T")}Z`;
}

/**
 * Composes one document out of state six existing services already computed.
 * It recalculates nothing, and the only rows it can leave behind are the
 * situation snapshots the shared overview builder persists — exactly as
 * opening Radar or running a scan can.
 */
export async function generateReport(options: GenerateReportOptions): Promise<GeneratedReport> {
  requireRole(options.session, "viewer");

  const symbols = normalizeSymbols(options.session, options.symbols);
  const timeframes = normalizeTimeframes(options.timeframes);
  const range = (validateOptionalRange(options.range ?? null) ?? defaultRange) as InsightRange;
  const sections = normalizeSections(options.sections);
  const format = normalizeFormat(options.format);
  const scope = buildScope(symbols, timeframes);

  // Checked before any overview is built, so an over-cap request costs none.
  if (scope.pairs.length > maxReportPairs) {
    throw new ApiInputError(
      `Report scope covers ${scope.pairs.length} pairs; the maximum is ${maxReportPairs}.`
    );
  }

  if (!options.db) {
    initializeDatabase();
  }

  const db = options.db ?? getDatabase();
  // One `now` for the whole report, so the header window, every section's
  // window, every composed value and the filename all agree.
  const now = options.now ?? new Date();
  const window = windowForRange(range, now);
  const requested = new Set(sections);

  // `portfolio` and `alerts` need analyst and a signed-in user. Reports does
  // not lower that bar and does not raise the whole request to meet it: the
  // section is omitted with a line explaining why, and the request still 200s.
  const user =
    hasRole(options.session, "analyst") && options.session.userId !== null ? options.session : null;

  /*
   * Composition order, which is deliberately not the display order. The
   * read-only sections are composed before the writing ones because
   * `getInsights` reads `situation_overviews` between `now - range` and `now`:
   * if `situation` ran first it would persist a snapshot stamped `now`, which
   * falls inside that window, and the `insights` section would read back a row
   * this same report created moments earlier and report its own side effect as
   * history.
   */
  let insights: Array<{ pair: ReportScopePair; response: InsightsResponse }> | null = null;

  if (requested.has("insights")) {
    insights = scope.pairs.map((pair) => ({
      pair,
      response: getInsights({ session: options.session, symbol: pair.symbol, timeframe: pair.timeframe, range, db, now })
    }));
  }

  let widgets: Array<{ pair: ReportScopePair; results: WidgetResultApi[] }> | null = null;

  if (requested.has("widgets")) {
    widgets = [];

    for (const pair of scope.pairs) {
      widgets.push({
        pair,
        results: filterVisibleWidgetResults(
          await listLatestWidgetResultsWithDerivedLiquidity(
            { symbol: pair.symbol, timeframe: pair.timeframe },
            db
          ),
          options.session
        )
      });
    }
  }

  let portfolio: PortfolioContextApi | null = null;

  if (requested.has("portfolio") && user !== null) {
    portfolio = getPortfolioContext({ session: user, db });
  }

  let alerts: { events: AlertEventApi[]; truncated: boolean } | null = null;

  if (requested.has("alerts") && user !== null) {
    const stored = listEventsForSession({
      session: user,
      // A report describes what the window held, not what is still unread.
      includeAcknowledged: true,
      limit: maxReportAlertEvents,
      db
    });
    // `listEventsForSession` has no window filter, so the selection happens
    // here, against instants rather than strings: the normalised `Z` form and
    // the window's `.000Z` form do not sort against each other.
    const from = Date.parse(window.from);
    const to = Date.parse(window.to);
    const events = stored
      .map((event) => ({ ...event, createdAt: toIsoTimestamp(event.createdAt) }))
      .filter((event) => {
        const at = Date.parse(event.createdAt);
        return at >= from && at <= to;
      });

    alerts = { events, truncated: stored.length === maxReportAlertEvents };
  }

  let situation: Array<{ pair: ReportScopePair; overview: SituationOverview }> | null = null;

  if (requested.has("situation")) {
    situation = [];

    for (const pair of scope.pairs) {
      situation.push({
        pair,
        overview: await getSituationOverview({
          symbol: pair.symbol,
          timeframe: pair.timeframe,
          session: options.session,
          db,
          now,
          // Generating a document must never manufacture alert events.
          evaluateAlerts: false
        })
      });
    }
  }

  let radar: Awaited<ReturnType<typeof getOpportunityRadar>> | null = null;

  if (requested.has("radar")) {
    radar = await getOpportunityRadar({
      session: options.session,
      symbols: scope.symbols,
      timeframes: scope.timeframes,
      db,
      now
    });
  }

  const document = buildReportDocument({
    now,
    range,
    window,
    scope,
    sections,
    situation,
    widgets,
    insights,
    radar,
    portfolio,
    alerts
  });

  return {
    document,
    format,
    body: serializeReport(document, format),
    filename: reportFilename(document, format),
    contentType: reportContentType(format)
  };
}
