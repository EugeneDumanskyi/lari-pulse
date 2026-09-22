# Reports

Reports composes one self-contained document out of state the app has
already computed — the current situation, the latest widget results,
what a window changed, what the radar ranks, and, for its owner, a
portfolio and alert summary — over a chosen scope and a chosen window,
and hands it back as a file in a plain local format.

It is not a model, not generated prose, not a forecast, and not a
performance or returns statement. Every line in a report is a value some
existing service already returned, placed under a label; nothing is
recalculated, reworded or ranked on the way through, and nothing is
phrased as an entry, an exit, a price target or a position size.

The boundary against the existing surfaces is the point of the feature.
[Situation Overview](SITUATION_OVERVIEW.md) answers "what is the state
right now", [Opportunity Radar](OPPORTUNITY_RADAR.md) answers "what
deserves attention right now", [Scans](SCANS.md) answers "which markets
match the conditions I named", [Insights](INSIGHTS.md) answers "what
changed over the window I chose", and Reports answers none of those. It
answers "give me all of that, for this scope and this window, as one
document that leaves the app". It is the only one of the five whose
output is a file rather than a page.

This document specifies the feature before it is built. The section
list, the composition order, the routes, the payload shapes, the three
serialized formats, the function signatures, the UI states and the test
names below are the contract, and a change to any of them is a change to
this file first.

## Scope

Implemented:

- Nothing yet.

Not implemented:

- `src/lib/services/reports/reports.types.ts`,
  `reports.serialize.ts` and `reports.service.ts`.
- `windowForRange` exported from
  `src/lib/services/insights/insights.service.ts`, where the window
  arithmetic is currently module-private.
- `GET /api/reports` (`src/app/api/reports/route.ts`).
- `GET /api/reports/download`
  (`src/app/api/reports/download/route.ts`).
- `/reports` page and the enabled sidebar item.
- `src/components/reports/ReportsFoundation.tsx`.
- The six sections, the three formats and every template below.
- `src/lib/services/reports/reports.serialize.test.ts`,
  `reports.service.test.ts`, the `reports access` block in
  `src/lib/auth/access.test.ts`, and `tests/e2e/reports.spec.ts` with
  `reports.fixtures.ts`.

Out of scope:

- Scheduling, email, webhooks, queues or background workers. A report is
  generated when someone asks for one, in the request.
- Returns, performance attribution or any profit and loss beyond what
  the portfolio section already computes for its owner.
- New collectors, widgets, indicators or external data sources. Reports
  adds no source; it reads what the app already produced.
- PDF and spreadsheet rendering. Both need a library, and a dependency
  needs the maintainer's yes; see [Open Questions](#open-questions).
- Persisted report runs. The `report_runs` sketch under
  [Open Questions](#open-questions) stays a later, separate addition.
- Any model in the text path. No generated, paraphrased or reworded
  sentence; a report carries the strings the composing services already
  returned, plus the fixed labels below.

## What It Composes

Six sections, each one existing call. Reports **recalculates nothing**:
its only rules are section assembly and serialization.

| Section | Source | Role | Writes |
| --- | --- | --- | --- |
| `situation` | `getSituationOverview({ evaluateAlerts: false })` per pair (`src/lib/services/situationOverview/situationOverview.service.ts:167`) | viewer | may INSERT a snapshot |
| `widgets` | `listLatestWidgetResultsWithDerivedLiquidity` per pair (`src/lib/services/widgetResultService.ts:82`) | viewer | no |
| `insights` | `getInsights` per pair (`src/lib/services/insights/insights.service.ts:128`) | viewer | no |
| `radar` | `getOpportunityRadar` once for the whole scope (`src/lib/services/opportunityRadarService.ts:225`) | viewer | may INSERT a snapshot |
| `portfolio` | `getPortfolioContext` (`src/lib/services/portfolioContextService.ts:373`) | analyst, user-owned | no |
| `alerts` | `listEventsForSession` (`src/lib/services/alertService.ts:398`) | analyst, user-owned | no |

The layer argument in one line: every score, bias, risk level, driver,
transition, holding and event in a report was computed by a service that
already owns that calculation, and Reports puts a label in front of it.
If a number in a report disagrees with the same number on its own page,
the bug is not in Reports.

Four of the six are market sections and read instance-wide state. Two
are personal, own rows, and are handled under [Access](#access).

The `insights` section is what makes a report describe a window rather
than a moment. Without it the document is six views of one instant, and
the `range` parameter would bound nothing.

### What the `insights` section leaves out

`getInsights` returns eight sections, and Reports carries **seven** of
them. Its `alert-activity` section is dropped, because Reports has its
own `alerts` section reading the same events over the same window, and
carrying both would put the same rows in one document twice — once under
a pair, once report-wide, with different wording and different caps.
`alerts` is the one that stays, because it is report-wide and a report's
scope is usually more than one pair.

This is the only place Reports drops part of a source's output. It is
stated here and it is a named test.

### The write side effect

Composing a report can **append a row to `situation_overviews`**, and
this spec states that rather than hiding it.

`getSituationOverview` persists a snapshot when the state materially
changed or `minimumSnapshotIntervalMs` — 15 minutes,
`src/lib/services/situationOverview/situationOverview.service.ts:41` —
has elapsed since the stored one (`shouldPersistOverview`,
`src/lib/services/situationOverview/situationOverview.service.ts:104-124`).
The `situation` section calls that builder per pair, and the `radar`
section calls `getOpportunityRadar`, which calls it again per pair
(`src/lib/services/opportunityRadarService.ts:241-248`). So a report
over three pairs can write up to three snapshots, exactly as opening
Radar or running a scan can, and exactly as
[OPPORTUNITY_RADAR.md](OPPORTUNITY_RADAR.md) and [SCANS.md](SCANS.md)
document. That is the existing behaviour of the shared builder, not
something Reports adds.

`evaluateAlerts: false` on every call, for the reason Radar and Scans
keep it off: generating a document must not manufacture alert events for
every covered market.

Nothing else is written. No `alert_events`, no `widget_results`, no
candles, no collection run, no external call, and no stored report. A
report exists in the response and in whatever file the browser saved.

### Composition order is part of the contract

The read-only sections are composed **before** the writing ones, with
one `now` fixed for the whole report:

```text
1. insights     read-only, windowed
2. widgets      read-only
3. portfolio    read-only
4. alerts       read-only
5. situation    may write a snapshot at `now`
6. radar        may write a snapshot at `now`
```

The display order is the table's order — `situation`, `widgets`,
`insights`, `radar`, `portfolio`, `alerts` — and it is not the
composition order. `buildReportDocument` emits sections in display
order; `generateReport` gathers their material in the order above.

The reason is specific. `getInsights` reads `situation_overviews`
between `now - range` and `now`. If the `situation` section ran first it
would persist a snapshot stamped `now`, which falls inside that window,
and the `insights` section would then read back and count a row the same
report created moments earlier. The document would report its own side
effect as history, its snapshot count would be one higher than the state
that existed when the user asked, and the extra row would appear in the
`window-coverage` line's source ids.

This is the detail most likely to be got wrong by someone building the
sections in the order they are displayed, so it is pinned here, it is a
comment in `reports.service.ts`, and it is a named test: the `insights`
section's snapshot count excludes the row the same report's `situation`
section wrote.

One `now` for the whole report is the other half of the rule. Every
section receives the same `Date`, so the window in the header, the
window each `insights` section reports, the `generatedAt` on every
composed value and the timestamp in the filename all agree. A section
that called `new Date()` itself would drift from the header by the time
the composition took.

## Scope, Window And Caps

```text
symbols     optional CSV. Default: the session's accessible active
            symbols, in appConfig.symbols order.
timeframes  optional CSV. Default: [defaultSituationTimeframe()].
range       optional 1d | 7d | 30d | 90d, default 7d. Bounds the
            insights and alerts sections.
sections    optional CSV of section ids. Default: all six.
format      optional markdown | json | csv, default markdown.

maxReportPairs = 24
```

The pair set is the cross product, `symbols × timeframes`, in
`appConfig.symbols` order then `collectionTimeframes` order — the same
deterministic ordering [SCANS.md](SCANS.md) fixes for its results.

The symbol default is Radar's: the active configured symbols filtered
through `canAccessSymbol` (`src/lib/auth/access.ts:202`), which is three
pairs today, all crypto. The timeframe default is deliberately **not**
Radar's. Radar defaults to all four `collectionTimeframes`, which would
make a default report twelve pairs and four documents' worth of content
for someone who asked for one. `defaultSituationTimeframe()`
(`src/lib/services/situationOverview/situationOverview.service.ts:246`)
returns `1h`, the same timeframe the dashboard opens on, so a default
report is three pairs.

The window is `{ from: now - range, to: now }`, computed once and shared.
`insights.service.ts` already does this arithmetic with a module-private
`rangeMs` table (`src/lib/services/insights/insights.service.ts:49`), so
the implementing pull request exports it as one helper rather than
declaring a second table:

```ts
// src/lib/services/insights/insights.service.ts
export function windowForRange(range: InsightRange, now: Date): InsightWindow
```

`getInsights` uses it internally, so there is exactly one definition of
what `30d` means, and the report header's window is the same window
every `insights` section reports. That equality is a named test.

### The pair cap is a 400, not a truncated report

A scope over `maxReportPairs` is rejected:

```text
400  Report scope covers 32 pairs; the maximum is 24.
```

The message names the count, so the caller knows how far over it is
without counting the cross product themselves.

This diverges from [Insights](INSIGHTS.md), whose row caps truncate and
say so in a line, and from [SCANS.md](SCANS.md), which left the scanned
pair count uncapped as an open question. Both divergences are
deliberate.

Against Insights: a truncated window is still an honest answer to "what
changed", because the line that truncated says how many rows it left
out and the reader is looking at a live page. A report is a document
someone keeps and hands to someone else, and the second reader has no
page to go back to. A silently short report is worse than a rejected
request, so the request is rejected.

Against Scans: a scan's cost is bounded by what it returns, and its work
is one overview per pair. A report's work is one overview, one widget
read and one windowed snapshot read per pair, plus a radar pass over all
of them, so the same scope costs several times more. Twenty-four pairs
is eight times today's default and covers every configured symbol at
every collected timeframe twice over, which is generous for a local
instance and small enough to stay a request.

24 is a named constant in `reports.service.ts`, so the tests assert
against the name.

### The row caps it inherits

Reports adds no row cap of its own beyond the pair cap. Every cap inside
a composed section is the composing service's, passes through unchanged,
and states what it left out in that section's `note`:

```text
insights   maxSnapshotsPerWindow = 5000, maxAlertEventsPerWindow = 500
           (src/lib/services/insights/insights.rules.ts:18-19), and the
           per-section line caps Insights already documents
radar      defaultLimit = 20 (src/lib/services/opportunityRadarService.ts:49)
alerts     maxReportAlertEvents = 500, the limit passed to
           listEventsForSession
widgets    none; the read returns the latest result per catalogued
           widget, so its size is the catalog's
portfolio  none; the read returns the owner's holdings
```

**The report exposes no radar limit.** `getOpportunityRadar` takes one
and clamps it to 50 (`src/lib/services/opportunityRadarService.ts:236`),
but a report parameter that changed how many ranked pairs appear would
be a second, quieter way of setting the report's scope. The default 20
stands. When the scope covers more than 20 pairs the radar section's
`note` says so:

```text
Ranked pairs are limited to the 20 highest ranking of the 24 covered.
```

That note is present whenever `items.length` is below the covered pair
count, and absent otherwise.

### The one timestamp Reports has to normalise

`listEventsForSession` has no window filter — it takes
`includeAcknowledged` and `limit` (`src/lib/services/alertService.ts:398-411`)
— so the `alerts` section reads the newest events and selects the ones
inside the report window itself.

That selection is a comparison against `alert_events.created_at`, which
takes the `datetime('now')` column default (`src/lib/db/schema.ts:169`)
and is stored as `2026-09-22 11:01:12`: UTC, space separator, no `T`, no
zone marker. `toEventApi` (`src/lib/services/alertService.ts:117`)
passes it through unchanged, and `new Date("2026-09-22 11:01:12")`
parses as **local** time, so on any instance not running in UTC a raw
comparison shifts every event by the host's offset. Reports applies the
same one-line normalisation Insights applies
(`src/lib/services/insights/insights.service.ts:75`) before comparing or
rendering anything:

```ts
`${stored.replace(" ", "T")}Z`
```

After that call every timestamp anywhere in a report is an ISO string
ending in `Z`.
[INSIGHTS.md](INSIGHTS.md#two-things-the-stored-timestamps-get-wrong)
carries the full account of the two stored formats; nothing in Reports
compares a value from `alert_events` against one from
`situation_overviews`.

The read is newest-first and the window's upper bound is `now`, so the
500 newest events are a superset of the in-window set whenever fewer
than 500 came back. When exactly 500 came back the section's `note`
states that older in-window events may be missing, because at that point
the superset argument no longer holds.

`includeAcknowledged: true`, because a report describes what the window
held, not what is still unread.

## Access

The request needs `viewer`. The service opens with one call:

```ts
requireRole(options.session, "viewer");
```

`requireRole` (`src/lib/auth/access.ts:114`), not `requireUser`
(`src/lib/auth/access.ts:127`). The four market sections read
instance-wide state and own no rows, so a public-dashboard anonymous
visitor — `role: "viewer"`, `userId: null`, `isAuthenticated: false` —
is a legitimate caller, exactly as they are on Radar, Scans and
Insights.

```text
401  anonymous with the public dashboard off
403  signed-in but below viewer
```

No role below `viewer` exists today, so the 403 path is unreachable in
practice; the access test still pins it, so that adding a lower role
later fails loudly here instead of silently widening the page.

### One endpoint, unreadable sections omitted

`portfolio` and `alerts` need more, and **get it without failing the
request**:

```ts
const user = hasRole(session, "analyst") && session.userId !== null ? session : null;
```

Both underlying services require `analyst` and a signed-in user —
`getPortfolioContext` calls `requireUser(options.session, "analyst")`
(`src/lib/services/portfolioContextService.ts:374`) and
`listEventsForSession` does the same
(`src/lib/services/alertService.ts:404`), which is the bar
[PORTFOLIO.md](PORTFOLIO.md) and [ALERTS.md](ALERTS.md) already state.
Reports does not lower that bar and does not raise the whole request to
meet it. A viewer asking for
a market report gets the four market sections and one line explaining
each of the other two, which is a better answer than a 403 for a
document that is mostly market content.

This is the `alert-activity` precedent from
[INSIGHTS.md](INSIGHTS.md#access), applied to two sections. One template
covers both the anonymous and the under-privileged case, for the reason
Insights gives: a message that distinguished them would tell an
anonymous caller that signing in is what is missing, and tell a viewer
that a role they do not have is what is missing, and the second half of
that is a small disclosure about the instance's role configuration in
return for nothing the caller can act on.

```text
portfolio  Portfolio is personal to a signed-in account with the
           analyst role, so it is not included in this report.
alerts     Alert activity is personal to a signed-in account with the
           analyst role, so it is not included in this report.
```

**Naming an unreadable section explicitly in `sections` is also omitted,
not a 403.** `?sections=situation,portfolio` from a viewer is a 200 with
`situation` included and `portfolio` omitted. The default request and
the explicit one give the same answer for the same session, which is
what keeps the page's section toggles honest: turning a section on never
turns a working request into a failing one.

A section not named in `sections` does not appear in `document.sections`
at all. A section named — or defaulted in — but unreadable appears with
`status: "omitted"` and its note. "Not asked for" and "asked for and not
allowed" are different answers and the document distinguishes them.

### Symbol reach

Every requested symbol goes through `validateSymbol`
(`src/lib/services/apiValidation.ts:27`) then `validateSymbolAccess`
(`src/lib/services/apiValidation.ts:87`), which is `requireRole` plus
`canAccessSymbol`. The first rejects an unknown or inactive symbol, the
second rejects one this session may not read, and neither alone covers
both. A symbol outside the session's `accessibleSymbols` is a 400 rather
than an empty section, so a report cannot be used to probe whether a
symbol the session may not read has stored state.

The default symbol set is filtered by `canAccessSymbol` before the cross
product is built, so a session with a narrow `accessibleSymbols` gets a
narrower default scope rather than a rejection.

### User-owned rows

**Reports adds no query of its own against `portfolio_items` or
`alert_events`.** It calls the two existing services, which resolve the
user from the session and filter on `user.userId` in their repositories
(`src/lib/services/portfolioContextService.ts:376`,
`src/lib/services/alertService.ts:406-410`). There is no user id
anywhere in `reports.service.ts` except the one `session.userId !== null`
check above, and none at all in `reports.serialize.ts`.

A cross-user isolation test is still required, and it is the one test
this feature could not inherit. The composition is new: it reads two
user-owned sources, merges them with four instance-wide ones, and
serializes the result into a single string that leaves the app. A defect
that put one user's holdings into another's document would not be caught
by either service's own isolation test, because neither service would
have done anything wrong. The test asserts against both `document` and
`body`; see [Tests](#tests).

## Layers

Stated against the layer rules in [CONTRIBUTING.md](../CONTRIBUTING.md).

**Service** — `src/lib/services/reports/`, split the way
`src/lib/services/insights/` is:

```text
reports.types.ts      every type, no logic
reports.serialize.ts  pure: document in, string out, per format;
                      every template
reports.service.ts    access, composition, ordering
```

The split is the point. `reports.serialize.ts` imports no database
client, no session type, no clock and no other service — it takes a
`ReportDocument` and returns a string — so all three formats are
testable on a fixed document with exact expected output, the way
indicators and widgets are. `reports.service.ts` is the only file that
knows a database or a session exists.

`buildReportDocument` is pure too, but it lives in `reports.service.ts`
rather than beside the serializers, because its input is the shape the
composition produces and its cases are the composition's cases —
default section set, per-section status, ordering. It takes no database,
no session and no clock beyond the `now` it is handed, and it is
exported so the service test can call it directly.

**Routes** — `src/app/api/reports/route.ts` and
`src/app/api/reports/download/route.ts`, both with
`export const runtime = "nodejs"`. Each reads the session with
`getSessionFromRequest` (`src/lib/auth/access.ts:102`), validates its
parameters, calls `generateReport` once, and wraps the handler in
`try`/`catch` with `apiErrorJson`
(`src/lib/services/apiResponses.ts:14`). No composition, no
serialization, no section assembly and no repository import in either.
The two routes differ only in how they return what the one service call
produced.

**Repositories** — none added. Reports reads through existing services
only, and `windowForRange` is an export of an existing service, not a
new read.

**Components** — render what the API returned. The foundation shows
`body` as text and `document.sections[].status` as a badge. **No
component composes a sentence**, formats a number or a date, joins a
list, or builds a file. If a string is missing from a report, it is
missing from `reports.serialize.ts`, and that is where it is added.

**Widgets, indicators, collectors** — unchanged. Nothing learns that a
report is being generated.

### The one place `okJson` does not apply

`CLAUDE.md` carries the `okJson` wrapper as a gotcha — every API
response in this app is `{ status, data }` and clients read
`json.data.x`. `/api/reports/download` is the single exception in the
app, and it is deliberate.

A browser download of

```json
{"status":"ok","data":{"body":"# LariPulse report\n\n…"}}
```

is not a report. It is a JSON file containing a report, with every
newline escaped, and no reader opens it as the document they asked for.
So the download route returns the serialized body as the whole response:

```ts
return new NextResponse(generated.body, {
  status: 200,
  headers: {
    "Content-Type": generated.contentType,
    "Content-Disposition": `attachment; filename="${generated.filename}"`,
    "Cache-Control": "no-store"
  }
});
```

It still uses `apiErrorJson` for failures, so **an error is wrapped and
a success is not**. A client therefore checks the status code, not the
shape: 200 means the body is the report in the requested format, and
anything else means the body is `{ status: "error", message }`. That
asymmetry is the price of a usable download, it is confined to this one
route, and it is written here so nobody reads
`/api/reports/download`'s handler and concludes the wrapper is optional.

`Cache-Control: no-store` because a report can carry one user's holdings
and alert events, and a reverse proxy is assumed
(`docs/auth.md` on `X-Forwarded-For`).

## Validation

Reused from `src/lib/services/apiValidation.ts`. No new helper there.

- `ApiInputError` (`:7`) — carries the status code `apiErrorJson`
  returns.
- `validateSymbol` (`:27`) then `validateSymbolAccess` (`:87`), per
  requested symbol.
- `validateCollectionTimeframe` (`:52`), per requested timeframe. **Not**
  `validateOptionalTimeframe` (`:38`), which allows the derived `7d`,
  `30d` and `90d` (`src/lib/config/timeframes.ts:2`) — those are chart
  ranges computed over daily candles, no stored state is ever keyed to
  one, and a report over `?timeframes=30d` would be a document full of
  empty sections that looked like a collection gap. This is the same
  correction [SCANS.md](SCANS.md) and
  [INSIGHTS.md](INSIGHTS.md#not-validateoptionaltimeframe) made, for the
  same reason.
- `validateOptionalRange` (`:62`) — allows `1d`, `7d`, `30d`, `90d`.

Two vocabularies are the feature's own, so they are validated in
`reports.service.ts` against their closed unions rather than added to
`apiValidation.ts`, the way `parseScanFilter` owns the scan condition
vocabulary:

```text
sections  each id must be one of the six. Unknown id:
          400  Unsupported report section: trades
          An empty sections= is the same as omitting it.
          Duplicates collapse; order in the parameter is ignored,
          because display order is fixed.
format    must be markdown | json | csv.
          400  Unsupported report format: pdf
```

`pdf` and `xlsx` are rejected by that check like any other unknown
value, with no special message. A message that said "not yet" would
promise something [Open Questions](#open-questions) has not decided.

The `range` and `timeframes` vocabularies overlap — `1d` is valid in
both and means the daily candle interval in one and a twenty-four-hour
lookback in the other, while `7d`, `30d` and `90d` are valid ranges and
invalid timeframes. Nothing is renamed; the error names the parameter,
which `validateCollectionTimeframe` does (`Unsupported timeframe: 7d`),
and the page keeps the two controls separate and labelled.
[INSIGHTS.md](INSIGHTS.md#the-range-and-timeframe-vocabulary-collision)
covers the collision in full.

The pair cap is checked after both lists are normalised and before any
section is composed, so an over-cap request costs no overview build.

## Formats

Three, and each is dependency-free. The app has no markdown renderer, no
CSV writer and no PDF library, and adding one needs the maintainer's
yes, so every format here is something a pure function can produce with
string concatenation.

```text
markdown   text/markdown; charset=utf-8      .md
json       application/json; charset=utf-8   .json
csv        text/csv; charset=utf-8           .csv
```

`reportContentType(format)` returns the middle column and
`reportFilename(document, format)` supplies the extension. Neither is
inlined in a route.

Every `value` in a document is already a string when it reaches a
serializer. `buildReportDocument` formats every number, date and list,
and collapses any `\r` or `\n` inside a value to a single space, so no
value it produces is multi-line. The serializers format nothing and
assume nothing — the CSV writer still quotes a newline correctly,
because its contract is the `ReportDocument` type rather than what the
composition happens to produce, and that is a named test.

### Markdown

Headings are pinned exactly. `#` for the document, `##` per section,
`###` per entry scope, and a `-` list item per fact.

```markdown
# LariPulse report

LariPulse produces analytical summaries of available market data. It is not financial advice, does not give buy or sell instructions, and does not guarantee future performance.

- Generated at: 2026-09-22T11:04:00.000Z
- Window: 2026-09-15T11:04:00.000Z to 2026-09-22T11:04:00.000Z (7d)
- Symbols: BTCUSDT, ETHUSDT, SOLUSDT
- Timeframes: 1h
- Pairs: 3

## Situation

### BTCUSDT 1h

- Bias: bullish
- Risk level: moderate
- Confidence: medium
- Score: 34
- Risk score: 41
- Main drivers: Trend Strength holding bullish; Volume Profile holding neutral
- Conflicting signals: none
- Watch conditions: none
- Generated at: 2026-09-22T11:03:58.000Z

## Widgets

### BTCUSDT 1h

- Trend Strength: bullish, score 34, confidence medium: Price is above both moving averages with rising structure.
- Momentum Exhaustion: neutral, score 4, confidence low: RSI sits mid-range with no divergence.

## Insights

### BTCUSDT 1h

- Snapshots: 14
- Covered window: 2026-09-16T08:00:00.000Z to 2026-09-22T11:01:12.000Z
- Window coverage: 14 situation snapshots cover the requested 7d window. The covered span runs 2026-09-16T08:00:00.000Z to 2026-09-22T11:01:12.000Z, narrower than the requested 7d window.
- Bias transitions: Bias moved from bullish to neutral at 2026-09-19T09:30:00.000Z, 2 days 3 hours after the previous snapshot.

## Radar

Ranked pairs are limited to the 20 highest ranking of the 24 covered.

- #1 BTCUSDT 1h: bullish, risk moderate, setup 62: Trend strength leads with volume confirming.
- #2 ETHUSDT 1h: neutral, risk moderate, setup 48: Momentum and trend disagree.

## Portfolio

- Holdings: 2
- Included in risk: 2
- Total market value: 18420.50
- Unrealized profit and loss: 1240.10 (7.22%)
- Largest holding: BTCUSDT at 74.30% of market value
- Highest risk holding: ETHUSDT, risk moderate
- BTCUSDT: 0.1200 BTCUSDT, market value 13687.20 USDT
- ETHUSDT: 1.0000 ETHUSDT, market value 4733.30 USDT

## Alerts

- Events in window: 3
- Acknowledged: 1
- 2026-09-20T14:12:09.000Z warning: BTCUSDT 1h: Situation bias changed
- 2026-09-21T06:41:55.000Z info: ETHUSDT 1h: Watch condition appeared
- 2026-09-22T09:02:31.000Z info: SOLUSDT 1h: Risk level changed
```

The serializer's rules, in full:

```text
"# LariPulse report", then a blank line
document.disclaimer as one paragraph, then a blank line
one "- {label}: {value}" per header fact
per section, in display order:
  a blank line, then "## {section.title}", then a blank line
  section.note as its own paragraph plus a blank line, when non-null
  per entry:
    "### {scope}" plus a blank line, when entry.scope is non-null
    one "- {fact.label}: {fact.value}" per fact
    a blank line after the entry
the document ends with exactly one newline
```

An omitted section renders its heading and its note and no entries, so
it is visible in the document rather than missing from it — the same
reason [Insights](INSIGHTS.md) renders `alert-activity` in place:

```markdown
## Portfolio

Portfolio is personal to a signed-in account with the analyst role, so it is not included in this report.
```

Values are not escaped. They are bias words, risk levels, numbers,
timestamps, catalogued widget titles and summaries the widget engines
composed, and the composition has already collapsed their newlines. A
`*` or `_` inside a widget summary renders as emphasis in a markdown
viewer and as itself in a text editor; that is accepted rather than
escaped, because escaping would put backslashes into the plain-text
reading of every report to fix a formatting artifact in one of them.

### JSON

```ts
JSON.stringify(document, null, 2)
```

Exactly that, with no trailing newline, so `JSON.parse(body)` deep-equals
the `document` the same call returned. That round trip is a named test.

Under `/api/reports` this makes `data.body` a string holding the same
content as `data.document`, serialized twice in one response. That is
said out loud so nobody reads it as a bug and "fixes" it: the response
shape is the same for all three formats, and the download route is what
earns the duplication, because it returns `body` alone and needs the
JSON format to be a real, complete file rather than a fragment.

### CSV

One row per fact, in the long form:

```text
section,scope,key,label,value
```

A report is not tabular. Its sections have different shapes — a
situation entry has nine facts, a portfolio entry has one row per
holding, an omitted section has none — and any wide layout would invent
a table that is not in the data and leave most of it empty. The long
form loses nothing and a spreadsheet can pivot it.

Row order:

```text
1. the header row, always
2. one row per document header fact, section "report", scope empty
3. per section, in display order:
     "{id},,status,Status,{status}"
     "{id},,note,Note,{note}"   when note is non-null
     one row per fact, scope = the entry's scope label or empty
```

Mechanics, pinned:

- **RFC 4180 quoting.** A field is quoted when it contains a comma, a
  double quote, a carriage return or a line feed; an inner double quote
  is doubled. Nothing else is quoted, so a report with no such character
  has no quote marks in it at all.
- **CRLF** after every row, including the last.
- **No UTF-8 BOM.** Excel would open a BOM-less UTF-8 file with mangled
  non-ASCII, and a BOM would break every byte-exact test and every
  `diff` — and in practice a report's non-ASCII is whatever a widget
  summary contains. The BOM stays out, and a spreadsheet import chooses
  the encoding.

### Filename and Content-Disposition

```text
laripulse-report-20260922T110400Z.md
laripulse-report-BTCUSDT-1h-20260922T110400Z.md
```

The timestamp comes from `document.generatedAt`:

```ts
generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
```

`2026-09-22T11:04:00.000Z` becomes `20260922T110400Z`. When the scope is
exactly one pair the filename carries it, because a folder of
single-pair reports is unreadable otherwise; at two pairs or more it
does not, because a list of symbols in a filename is worse than none.

Every part is **ASCII by construction**. Symbols come from
`appConfig.symbols`, timeframes from `collectionTimeframes`, the
timestamp from an ISO string and the extension from a three-value union
— all closed vocabularies, never user text. That is why

```text
Content-Disposition: attachment; filename="laripulse-report-20260922T110400Z.md"
```

needs no `filename*` percent-encoding and no quote escaping. It is
stated here rather than left implicit so that a later free-text report
name — the maintainer question at the end of this document — does not
quietly break the header for every client that receives one.

## API

Two routes. Same parameters, same service call, different response.

```text
GET /api/reports
GET /api/reports/download
```

### Request parameters

```text
symbols     optional CSV. Default: the session's accessible active
            symbols. Each goes through validateSymbol and
            validateSymbolAccess.
timeframes  optional CSV. Default: defaultSituationTimeframe(). Each
            goes through validateCollectionTimeframe.
range       optional, "1d" | "7d" | "30d" | "90d". Default "7d".
sections    optional CSV of the six section ids. Default: all six.
format      optional, "markdown" | "json" | "csv". Default "markdown".
```

### Response — `/api/reports`

Under the `okJson` `{ status, data }` wrapper, so clients read
`json.data`. Trimmed here; the real document carries every requested
section.

```jsonc
{
  "status": "ok",
  "data": {
    "format": "markdown",
    "filename": "laripulse-report-20260922T110400Z.md",
    "contentType": "text/markdown; charset=utf-8",
    "body": "# LariPulse report\n\nLariPulse produces analytical summaries…",
    "document": {
      "generatedAt": "2026-09-22T11:04:00.000Z",
      "range": "7d",
      "window": {
        "from": "2026-09-15T11:04:00.000Z",
        "to": "2026-09-22T11:04:00.000Z"
      },
      "scope": {
        "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
        "timeframes": ["1h"],
        "pairs": [
          { "symbol": "BTCUSDT", "timeframe": "1h" },
          { "symbol": "ETHUSDT", "timeframe": "1h" },
          { "symbol": "SOLUSDT", "timeframe": "1h" }
        ]
      },
      "disclaimer": "LariPulse produces analytical summaries of available market data. It is not financial advice, does not give buy or sell instructions, and does not guarantee future performance.",
      "header": [
        { "key": "generated-at", "label": "Generated at", "value": "2026-09-22T11:04:00.000Z" },
        { "key": "window", "label": "Window", "value": "2026-09-15T11:04:00.000Z to 2026-09-22T11:04:00.000Z (7d)" },
        { "key": "symbols", "label": "Symbols", "value": "BTCUSDT, ETHUSDT, SOLUSDT" },
        { "key": "timeframes", "label": "Timeframes", "value": "1h" },
        { "key": "pairs", "label": "Pairs", "value": "3" }
      ],
      "sections": [
        {
          "id": "situation",
          "title": "Situation",
          "category": "market",
          "status": "included",
          "note": null,
          "entries": [
            {
              "scope": { "symbol": "BTCUSDT", "timeframe": "1h" },
              "facts": [
                { "key": "bias", "label": "Bias", "value": "bullish" },
                { "key": "risk-level", "label": "Risk level", "value": "moderate" }
              ]
            }
          ]
        },
        {
          "id": "radar",
          "title": "Radar",
          "category": "market",
          "status": "included",
          "note": "Ranked pairs are limited to the 20 highest ranking of the 24 covered.",
          "entries": [
            {
              "scope": null,
              "facts": [
                {
                  "key": "rank-1",
                  "label": "#1 BTCUSDT 1h",
                  "value": "bullish, risk moderate, setup 62: Trend strength leads with volume confirming."
                }
              ]
            }
          ]
        },
        {
          "id": "portfolio",
          "title": "Portfolio",
          "category": "personal",
          "status": "omitted",
          "note": "Portfolio is personal to a signed-in account with the analyst role, so it is not included in this report.",
          "entries": []
        }
      ]
    }
  }
}
```

`status` is `"included" | "empty" | "omitted"`, per section:

```text
included  the section was computed and has at least one fact
empty     the section was computed and has nothing to report — no
          stored state for any pair, no ranked item, no holding, no
          event in the window. `note` says what was looked for.
omitted   the session may not read it. `note` is the fixed template.
```

It is deliberately **not** called `coverage`. That word means something
narrower in [Insights](INSIGHTS.md), where it describes how much of a
window the stored rows covered, and reusing it for "did this section run
at all" would put two meanings on one key across two features that
appear in the same document.

`entries` is `[]` for an `omitted` or `empty` section rather than a
missing key. `scope` is `null` on a report-wide entry — radar, portfolio
and alerts — and a pair on the three per-pair sections.

### Response — `/api/reports/download`

The serialized body, unwrapped, with the headers under
[The one place `okJson` does not apply](#the-one-place-okjson-does-not-apply).
On failure, `apiErrorJson`'s wrapped error. A client checks the status
code.

### Status codes

Both routes, identically.

```text
200  the report was composed, including when every section came back
     empty and including when both personal sections came back omitted
400  unknown or inaccessible symbol
     timeframe outside collectionTimeframes, which includes 7d, 30d
       and 90d
     range outside 1d / 7d / 30d / 90d
     unknown section id
     unknown format
     more than 24 pairs, with the count in the message
401  anonymous with the public dashboard off
403  signed-in but below viewer
```

There is no 404. A pair with no stored state is reported **inside** the
document — its `situation` entry says the state is unknown and its
`widgets` entry says nothing has been collected — because an
uncollected pair is a collection gap, not a bad request, and a report
that silently dropped it would misrepresent its own scope.

### Curl

```bash
curl --get http://localhost:3000/api/reports \
  --data-urlencode 'symbols=BTCUSDT,ETHUSDT' \
  --data-urlencode 'timeframes=1h' \
  --data-urlencode 'range=7d' \
  --data-urlencode 'format=markdown'

curl --get http://localhost:3000/api/reports \
  --data-urlencode 'sections=situation,insights' \
  --data-urlencode 'range=30d' \
  --data-urlencode 'format=json'

curl --get --remote-name --remote-header-name \
  http://localhost:3000/api/reports/download \
  --data-urlencode 'symbols=BTCUSDT' \
  --data-urlencode 'timeframes=1h' \
  --data-urlencode 'range=90d' \
  --data-urlencode 'format=csv'
```

The third writes `laripulse-report-BTCUSDT-1h-<timestamp>.csv` into the
working directory, which is the `Content-Disposition` header doing its
job.

## Service Signatures

Four pure functions and one async entry point.

```ts
buildReportDocument(input: BuildReportDocumentInput): ReportDocument
serializeReport(document: ReportDocument, format: ReportFormat): string
reportFilename(document: ReportDocument, format: ReportFormat): string
reportContentType(format: ReportFormat): string

generateReport(options: {
  session: AuthSession;
  symbols?: string[];
  timeframes?: string[];
  range?: InsightRange;
  sections?: ReportSectionId[];
  format?: ReportFormat;
  db?: Database.Database;
  now?: Date;
}): Promise<GeneratedReport>
```

`buildReportDocument` is **pure**: already-fetched material in, a
document out. No database, no session, no network, no `Date.now()` —
`now` arrives in the input. Every label, every value format and every
`note` is decided here, so the whole document is testable without
seeding a database twice.

`serializeReport`, `reportFilename` and `reportContentType` are pure and
live in `reports.serialize.ts`. They take a document and a format and
nothing else, so every byte of every format is asserted on a fixed
document.

`generateReport` is **async**, unlike `getInsights`, which is
synchronous and says so
([INSIGHTS.md](INSIGHTS.md#service-signatures)). The reason is not
Reports' own: `getSituationOverview`
(`src/lib/services/situationOverview/situationOverview.service.ts:167`),
`getOpportunityRadar`
(`src/lib/services/opportunityRadarService.ts:225`) and
`listLatestWidgetResultsWithDerivedLiquidity`
(`src/lib/services/widgetResultService.ts:82`) all return promises —
the last one because it runs the liquidations widget over a freshly
built liquidity context — so any composition that includes them is
async. It awaits existing service calls and nothing else; there is no
fetch, no timer and no I/O of its own in its path.

The optional `db` follows every other service, so tests pass an
in-memory database, and it is threaded into every composed call so the
whole report reads one database. When `db` is absent,
`initializeDatabase()` then `getDatabase()`, as
`src/lib/services/situationOverview/situationOverview.service.ts:151-155`
does.

`range` reuses `InsightRange` rather than declaring a parallel union.
The two features mean the same four windows, and a second union would
drift the first time one of them gained a value.

### Types

Declared in `src/lib/services/reports/reports.types.ts` and re-exported
from `src/lib/api/types.ts` beside the Insights block
(`src/lib/api/types.ts:312-325`).

```ts
type ReportFormat = "markdown" | "json" | "csv";

type ReportSectionId =
  | "situation"
  | "widgets"
  | "insights"
  | "radar"
  | "portfolio"
  | "alerts";

type ReportSectionCategory = "market" | "personal";

type ReportSectionStatus = "included" | "empty" | "omitted";

interface ReportScopePair {
  symbol: string;
  timeframe: string;
}

interface ReportScope {
  symbols: string[];
  timeframes: string[];
  pairs: ReportScopePair[];
}

interface ReportFact {
  key: string;
  label: string;
  value: string;
}

interface ReportEntry {
  scope: ReportScopePair | null;
  facts: ReportFact[];
}

interface ReportSection {
  id: ReportSectionId;
  title: string;
  category: ReportSectionCategory;
  status: ReportSectionStatus;
  note: string | null;
  entries: ReportEntry[];
}

interface ReportDocument {
  generatedAt: string;
  range: InsightRange;
  window: InsightWindow;
  scope: ReportScope;
  disclaimer: string;
  header: ReportFact[];
  sections: ReportSection[];
}

interface GeneratedReport {
  document: ReportDocument;
  format: ReportFormat;
  body: string;
  filename: string;
  contentType: string;
}
```

`ReportFact.value` is a `string` and never a number, a date or an array.
Every format writes it as it stands, which is what keeps the three
serializers free of formatting rules and keeps one number rendered
identically in all three.

The composition input. Each field is the material one section needs, and
`null` means the section is in `sections` but the session may not read
it — a section not requested at all is absent from `sections` instead:

```ts
interface BuildReportDocumentInput {
  now: Date;
  range: InsightRange;
  window: InsightWindow;
  scope: ReportScope;
  sections: ReportSectionId[];
  situation: Array<{ pair: ReportScopePair; overview: SituationOverview }> | null;
  widgets: Array<{ pair: ReportScopePair; results: WidgetResultApi[] }> | null;
  insights: Array<{ pair: ReportScopePair; response: InsightsResponse }> | null;
  radar: OpportunityRadarResponse | null;
  portfolio: PortfolioContextApi | null;
  alerts: { events: AlertEventApi[]; truncated: boolean } | null;
}
```

Every one of those types is an existing export —
`SituationOverview`, `WidgetResultApi`, `InsightsResponse`,
`OpportunityRadarResponse`, `PortfolioContextApi` and `AlertEventApi` —
imported rather than restated. A narrowed copy would let a service's
field change without this composition failing to compile, which is
exactly the failure the compiler should catch.

`alerts.events` have already been through the timestamp normalisation
under [The one timestamp Reports has to normalise](#the-one-timestamp-reports-has-to-normalise)
and are already filtered to the window, so `buildReportDocument` never
parses a timestamp or compares one to a bound. `alerts.truncated` is
`true` when the read came back at exactly `maxReportAlertEvents`, and it
is what produces that section's note.

The disclaimer is a module constant in `reports.serialize.ts`, matching
the line in `README.md` verbatim, so a report handed to someone carries
it in its own header and does not depend on the reader having seen the
app.

## UI

`/reports` is a guarded page:

```tsx
export default async function ReportsPage() {
  const session = await requirePageSession("/reports");

  return (
    <SessionProvider session={session}>
      <ReportsFoundation />
    </SessionProvider>
  );
}
```

The default `minimumRole: "viewer"` and **no** `signedIn: true`. Four of
the six sections are instance-wide market content, so the page has a
real report to give an anonymous visitor when the public dashboard is
on. The shape follows `src/app/insights/page.tsx` and
`src/app/scans/page.tsx` — a server guard wrapping `SessionProvider`
around a client foundation component.

`requirePageSession` goes through `pageInstanceStatus()`, which awaits
`connection()` (`src/lib/auth/pageGuard.ts:14-15`). Without that the
route is prerendered as a static redirect to `/setup` and a built
instance is permanently broken, so the route must appear as `ƒ` and not
`○` in `next build` output. Check the build output before the pull
request.

### Shell

`AppShell`'s `activeItem` union
(`src/components/dashboard/primitives.tsx:408`) gains `"reports"`, and
the nav item at `src/components/dashboard/primitives.tsx:424` loses
`disabled: true` and gains `active: activeItem === "reports"` and an
`onClick` pushing `/reports`. It keeps its `Activity` icon.

It takes **no** `hidden`, matching Radar, Scans and Insights. The page
is open to everyone the guard lets through, including the
public-dashboard anonymous visitor, and the two sections they cannot
have explain themselves in place rather than removing the page from
their navigation.

This is the last of the four disabled placeholders, so after this pull
request `disabled: true` appears nowhere in `nav`, and the
`AppNavItem.disabled` field itself has no remaining user. Removing it is
a separate cleanup and not part of this feature.

### Foundation component

`src/components/reports/ReportsFoundation.tsx`, following
`src/components/insights/InsightsFoundation.tsx`:

- a symbol control whose options come from `GET /api/symbols` and a
  timeframe control over `collectionTimeframes`, both multi-select,
  neither hardcoded in the component — the Radar foundation's
  module-level `symbols` / `timeframes` constants
  (`src/components/radar/OpportunityRadarFoundation.tsx:28-29`) are a
  precedent not to copy
- a range control over the four `validateOptionalRange` values and a
  format control over the three `ReportFormat` values
- six section toggles, all on by default, sending `sections` only when
  the selection is not all six
- a **monospace preview** of `body` in a scrollable panel. There is no
  markdown renderer in the app and this feature does not add one, so
  markdown is shown as the text it is, which is also what makes the
  preview honest: what the user reads is byte-for-byte what the download
  gives them
- a **status badge per section**, from `document.sections[].status`,
  rendered above the preview so an omitted or empty section is visible
  without scrolling the body. This is the one place the component reads
  `document` rather than `body`
- a **Download control** that navigates to `/api/reports/download` with
  the same query string. It does not build a `Blob`, does not
  re-serialize `document`, and does not reuse the `body` already on
  screen — the server owns the bytes and the filename, and a second
  code path in React would be a second definition of both
- a scope line showing the pair count, so the 24-pair cap is visible
  before the request rather than only in its error
- `GlassCard`, `GlassPanel`, `StatusBadge`, `MetricPill` and
  `EmptyState` from `src/components/dashboard/primitives.tsx`, reused
  rather than restyled

Generating re-issues one `GET /api/reports` and replaces the preview and
the badges together. The component never merges two responses, never
keeps a previous report's badges beside a new report's body, and never
filters or reorders `sections`.

Timestamps inside the preview are left exactly as the body holds them —
UTC, ISO, ending in `Z`. The preview is the file, and rewriting its
timestamps to local time would show the user something the download does
not contain. This is the one place the app deliberately does **not** run
`replaceIsoDatesWithLocalTime` from `src/lib/utils/formatDateTime`; the
page's own chrome, such as a "generated at" line beside the controls,
still does.

### States

Each is a state the implementation must render, and the E2E and manual
passes walk them:

| State | What renders |
| --- | --- |
| Initial | `EmptyState`: what a report is, the current scope, and the control to generate one. Nothing has run |
| Generating | The controls and both actions disable; a previous report stays on screen rather than blanking |
| Generated | The section badges above a monospace preview of `body`, with the Download control enabled |
| Section omitted | Its badge reads `omitted` and its heading and note render in place in the preview, not hidden |
| Pair without state | The pair's entries render with their unknown-state values; the pair is never dropped from the document |
| Over the pair cap | The 400 message with its count renders inline beside the controls; the scope line already showed the count |
| Invalid parameter | The 400 message renders inline; the previous report is left intact and nothing is cleared |
| Load error | An error panel with the message and a retry that re-issues the same request |
| Download | The Download control navigates to `/api/reports/download` with the same query; the page state does not change |
| Anonymous, public dashboard off | The page never renders; the guard redirects to `/login?next=%2Freports` |

Nothing on the page ranks a section, scores a report, or phrases
anything as something to do.

## Tests

By file and by case.

**`test:services` — `src/lib/services/reports/reports.serialize.test.ts`**

A fixed `ReportDocument` in, an exact string out. This file is where the
three formats are pinned, and every case asserts the full body, not a
substring.

- markdown: the full document, asserted byte for byte — the `#` title,
  the disclaimer paragraph, the header list, `##` per section, `###`
  per entry scope, `-` per fact, exactly one trailing newline
- markdown: a report-wide entry renders no `###` heading; an omitted
  section renders its `##` heading and its note and no entries; an
  `empty` section renders its note
- json: `JSON.parse(serializeReport(document, "json"))` deep-equals
  `document`, and the string equals `JSON.stringify(document, null, 2)`
  with no trailing newline
- csv: the header row, the `report`-section header rows, a `status` row
  per section, a `note` row only where `note` is non-null, and one row
  per fact in document order
- csv quoting: a value holding a comma, a value holding a double quote,
  a value holding both, and a value holding a newline — each quoted per
  RFC 4180 with inner quotes doubled, and a value holding none of them
  left unquoted
- csv: every row ends `\r\n`, including the last, and the first byte of
  the output is `s` — asserting there is **no UTF-8 BOM**
- `reportFilename` per format: `.md`, `.json`, `.csv`, with the
  timestamp derived from `generatedAt` as `20260922T110400Z`
- `reportFilename` for a one-pair scope carries `BTCUSDT-1h`; for a
  two-pair scope it does not; for a one-symbol two-timeframe scope it
  does not
- `reportContentType` returns the three pinned strings
- determinism: the same document serialized twice in each format
  produces identical strings

**`test:services` — `src/lib/services/reports/reports.service.test.ts`**

On a seeded in-memory database, with a fixed `now`.

- the default section set is all six, in display order, for an analyst
- `sections: ["situation", "insights"]` returns exactly those two, in
  display order, and no key for the other four
- **the ordering rule**: with a `now` that guarantees
  `shouldPersistOverview` fires, a report whose scope is one pair leaves
  `situation_overviews` one row longer, and the `insights` section's
  snapshot count and source ids **exclude** that row — proven by
  comparing against `getInsights` called with the same `now` before the
  report ran
- one `now` reaches every section: the document's `window` equals every
  `insights` entry's `requestedWindow`, and `generatedAt` matches the
  timestamp in `filename`
- `windowForRange` gives the same window `getInsights` computes
  internally, for all four ranges
- the `insights` section carries seven of Insights' eight sections and
  drops `alert-activity`, for an analyst who has events in the window
- **no `alert_events` written** even with an alert rule seeded that
  would fire for a covered pair: the `alert_events` row count is
  identical before and after, which is `evaluateAlerts: false` holding
- no `widget_results` row is written, and no `collection_runs` row
- a viewer gets `portfolio` and `alerts` with `status: "omitted"`, their
  fixed notes, empty `entries`, and the request still returns a
  document with the four market sections populated
- a viewer naming `sections=portfolio` explicitly gets the same omitted
  section and a 200, not a 403
- an analyst gets both personal sections computed from their own rows
- **two users, one database**: user A's holdings, symbols, labels, notes
  and alert event titles appear in neither `document` nor `body` of user
  B's report, asserted against the serialized string as well as the
  object
- the public-dashboard anonymous session — `role: "viewer"`,
  `userId: null` — gets the four market sections and the two omitted
- a symbol outside `accessibleSymbols` throws `ApiInputError` with
  status 400 rather than being dropped from the scope
- a timeframe of `30d` throws `ApiInputError` with status 400
- an unknown section id and an unknown format each throw
  `ApiInputError` with status 400
- **25 pairs is a 400** whose message names 25, and no overview is built
  — proven by the `situation_overviews` row count being unchanged; 24
  pairs succeeds
- a pair with no stored state is present in the document with its
  unknown-state values, and is never dropped from `scope.pairs`
- the radar note appears when the covered pair count exceeds the
  returned item count and is absent otherwise
- the `alerts` section selects only events inside the window, with an
  event stored through the `datetime('now')` default at each bound, and
  its rendered timestamps are ISO strings ending in `Z` at the instant
  they were stored — the local-time parse would shift them and the
  assertion catches that
- `generateReport` returns a promise, and `body` equals
  `serializeReport(document, format)` for all three formats
- anonymous with the public dashboard off throws 401

**`test:auth` — `src/lib/auth/access.test.ts`**

- anonymous with the public dashboard off against a `viewer`
  requirement: 401
- a signed-in session below `viewer`: 403
- the public-dashboard anonymous viewer passes
  `requireRole(session, "viewer")`, which is what lets the four market
  sections compose for them
- that same session fails `requireUser(session, "analyst")`, which is
  exactly what makes `portfolio` and `alerts` omitted rather than a 403
  on the request

**`test:e2e` — `tests/e2e/reports.spec.ts`**

- the sidebar item is enabled and navigates — through the `<aside>` on
  `chromium-desktop` and the drawer below `lg`, as
  `tests/e2e/navigation.spec.ts` does
- generating a report renders the section badges and the preview
- changing the format re-issues the request and replaces the preview
- an omitted section renders its badge and its note in place
- the Download control targets `/api/reports/download` with the same
  query string as the preview request, asserted on the request rather
  than on a saved file

All five run on the three configured viewports. `/api/reports` is mocked
from a `tests/e2e/reports.fixtures.ts` module the way
`tests/e2e/insights.fixtures.ts` mocks `/api/insights`: the first-run
E2E database has no widget results and no situation snapshots, so an
unmocked page could only ever exercise the no-stored-state path, and the
generated, omitted and format-change cases each need a payload the suite
controls.

### What the implementing pull request runs

Per the definition of done: `npm run lint`, `npm run typecheck`, the
eight unit test scripts, `npm run build` — `/reports` is a guarded page,
so check it shows as `ƒ` — and `npm run test:e2e`, because this adds a
UI flow. It also updates `docs/architecture.md` with the two new routes,
including the note that `/api/reports/download` is the one unwrapped
response, and `docs/auth.md` with the per-section role rule.

## Guardrails

- No composition and no serialization in a route handler or in React.
  The routes validate, call `generateReport` once, and return. The
  component renders `body` and the per-section `status`.
- No recalculation. Every value in a report comes from a service that
  already owns that calculation, and a report never re-derives a score,
  a bias, a transition or a holding's value.
- `evaluateAlerts: false` on every `getSituationOverview` call, direct
  or through `getOpportunityRadar`. Generating a document never raises
  an alert event.
- Read-only sections before writing ones, one `now` for the whole
  report. A report never reads back a row it created.
- No cross-user read. Personal sections come from the two existing
  services, which filter by the signed-in user, and Reports writes no
  query against `portfolio_items` or `alert_events`.
- No bypass of symbol access. Every symbol, default or explicit, goes
  through `canAccessSymbol` or `validateSymbolAccess`.
- No new collector, widget, indicator, external data source, queue,
  worker, cache or scheduled job.
- No dependency for PDF or spreadsheet output, or for rendering
  markdown, without the maintainer's yes. All three formats here are
  string concatenation.
- The pair cap is a 400 that names the count, and every inherited row
  cap states in its section's `note` what it left out. No cap is applied
  silently.
- The document's own header carries the `README.md` disclaimer line, so
  a report handed to someone carries it too.
- Nothing rendered, returned or serialized is phrased as a prediction, a
  recommendation, an entry, an exit, a price target or a position size.

## Open Questions

### Resolved from the skeleton

- **"Which sections make the default report?"** — Resolved. All six the
  session can read: `situation`, `widgets`, `insights`, `radar`,
  `portfolio`, `alerts`. The three market sections the skeleton listed
  describe one moment; adding the `insights` read is what makes the
  document about the window its `range` parameter names, and the two
  personal sections are what make a report worth keeping for the person
  who generated it. A viewer's default report is the four market
  sections plus two omitted ones, which is a smaller document rather
  than a different feature.
- **"One endpoint with the unreadable sections omitted, or two?"** —
  Resolved: one endpoint, unreadable sections omitted with a stated
  line, and the request still 200. Two endpoints would need two routes,
  two service entry points and two sets of tests to express one role
  check that the composing services already perform, and the section
  list would then be part of the URL rather than part of the document.
  Naming an unreadable section explicitly is omitted too, so the
  default and the explicit request agree.
- **"Is generation capped by window length?"** — Resolved: no window
  cap. `validateOptionalRange`
  (`src/lib/services/apiValidation.ts:62`) already closes the
  vocabulary at four values with `90d` the longest, so there is no
  unbounded window to cap. The real limits are the per-section row caps
  under [The row caps it inherits](#the-row-caps-it-inherits), and those
  truncate and say so, in the composing service's own terms. The cap
  this feature adds is on **scope**, not window, and it is a 400 — see
  [The pair cap is a 400](#the-pair-cap-is-a-400-not-a-truncated-report).

### For the maintainer

- **Persisted report runs.** A user-owned `report_runs` table holding
  `user_id`, the parameters, the generated body or a path to it, and
  timestamps, with `ON DELETE CASCADE` and an index led by `user_id`.
  Every query would filter by the signed-in user and a cross-user
  isolation test would be required. Because there are no migrations,
  the pull request adding it must say which kind of schema change it
  is: a purely additive table appears on an existing database by
  itself, since `runMigrations` (`src/lib/db/migrations.ts:59`) execs
  `schemaSql` — all `CREATE TABLE IF NOT EXISTS` — on every start,
  while a change to an existing table's shape needs deleting
  `data/laripulse.sqlite` plus `-wal`/`-shm` and running
  `npm run db:init`. Storing bodies also turns a stateless feature into
  one with a growth curve and a retention question, which is the real
  decision.
- **PDF and spreadsheet output.** Both need a library, and a runtime
  dependency needs the maintainer's yes. A PDF renderer is the larger
  ask — it would be the first one in the app that draws — and an
  `.xlsx` writer would raise the question the CSV long form
  deliberately avoids, which is what the columns of a report are.
- **Whether a watchlist section belongs.** A seventh section over a
  user's `watchlist_items` would be the natural bridge between a report
  and the pairs someone actually follows, and it could supply the scope
  instead of the symbol and timeframe controls. It is user-owned, so it
  would carry the isolation rule [WATCHLIST.md](WATCHLIST.md) already
  states, and it needs `viewer` plus signed-in rather than `analyst`,
  which would make it the first section with a third role shape. Left
  out rather than guessed at.
- **Whether 24 is the right pair cap.** It is eight times today's
  default and twice the full configured cross product, chosen to be
  generous on a local instance while keeping a report a request rather
  than a job. The number to revisit it against is how long a 24-pair
  report takes on real hardware, which nothing has measured.
- **Whether the instance should be named in the document header.** A
  report leaves the app, and a reader holding two of them from two
  instances cannot tell them apart. There is no instance name in
  `app_settings` today, so adding one to the header means adding one to
  the instance — a settings field, an admin control and a schema
  change — for a line in a document. Deliberately not decided here.
