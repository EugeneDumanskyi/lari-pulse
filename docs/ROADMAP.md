# Roadmap

What is planned and not yet built. Each feature below links its own
specification, written before any code and taken to implementation
depth before the pull request that builds it. Nothing is implemented
until a pull request lands and moves a capability out of that spec's
`Not implemented:` list.

Build order: Watchlist has landed, having sat closest to the existing
portfolio and alert plumbing, and the dead mock UI cleanup has followed
it, so every page now has navigation below `lg`. Scans has landed next,
as the first of the three stateless features, and Insights after it.
Reports is the one feature left, and it comes last by design: it
composes what the other surfaces already produce, so every one of its
sources had to exist before it could be specified against them.

## 1. Dead mock UI cleanup — landed

`TopBar`, `SymbolTabs`, `StaleWarning` and `LoadingToast` were exported
from `src/components/dashboard/primitives.tsx` and imported nowhere, and
removing `SymbolTabs` orphaned `ToolbarButton`, so all five are gone.

Navigation below `lg` is a drawer in `AppShell`: the sidebar stays
`hidden … lg:flex`, and under it a header bar carries the logo and an
`Open navigation` button that opens the same nav list and account panel,
both now shared between the two rather than duplicated. It closes on
navigation, on the backdrop and on Escape.

The same pass made the existing chrome actually work. The glass surfaces
are tuned in one-percent steps — `text-white/62`, `border-white/12`,
`bg-slate-950/42` — but Tailwind's stock opacity scale only goes in
fives, so about ninety utilities across the app silently generated
nothing: text fell back to the inherited colour, borders to the
near-white default and, worst, form fields lost their background and
rendered the user agent's white behind `text-white`, which made every
input on Portfolio and Watchlist unreadable. `tailwind.config.ts` now
carries whole percents, `:root` declares `color-scheme: dark` so native
controls follow, and the two `text-current/8x` classes — an alpha on
`currentColor`, which Tailwind cannot express — became `opacity-8x`.

## 2. Watchlist — landed

One place to keep the symbol and timeframe pairs a user follows, showing
each pair's existing deterministic state side by side. Minimum role:
signed-in `viewer`, which makes it the first user-owned data available
below `analyst`. It adds one user-owned table, `watchlist_items`, which
needed no database reset: `schemaSql` runs as `CREATE TABLE IF NOT
EXISTS` on every start, so a purely additive table appears on an existing
database by itself. Only a change to an existing table's shape needs the
delete-and-`npm run db:init` dance.

Ordering is manual through an explicit `position` column, symbols are the
active Binance pairs only, timeframes are the four collected ones, and
`portfolio_items` is untouched.

See [WATCHLIST.md](WATCHLIST.md).

## 3. Scans — landed

Runs an explicit, user-stated filter across the configured symbols and
timeframes and returns the pairs whose stored deterministic state
matches, naming the conditions that matched and, under `match: "any"`,
the ones that did not. It complements
[Opportunity Radar](OPPORTUNITY_RADAR.md) rather than replacing it:
Radar answers "what deserves attention right now", and Scans answers
"which markets match the conditions I named". Minimum role: `viewer`,
including the public-dashboard anonymous visitor, since a scan owns no
rows.

It added no table and no widget, reading state only through
`getSituationOverview` with alert evaluation off. The condition
vocabulary is closed and flat — eleven condition types validated by an
exhaustive switch, at most twelve conditions per filter — so there is no
expression language to maintain, and every condition carries a fixed
human label so the matched and unmatched lists read as sentences rather
than echoed JSON. `items` is a set in a deterministic order, never a
ranking; an empty result set is explained by the per-condition counts in
`summary.conditionSummary` rather than by a near-miss list.

See [SCANS.md](SCANS.md).

## 4. Insights — landed

A deterministic read of what changed across a window, assembled from
already persisted snapshots. Eight sections, always all eight, each with
its own coverage: window coverage, bias transitions, risk transitions,
recurring drivers, persistent conflicts, watch conditions, data coverage
and alert activity. Every sentence is a template over stored values and
every line names the rows it came from. It is the only one of the
stateless features that reads a range of rows rather than the latest
state.

Minimum role: `viewer`, including the public-dashboard anonymous
visitor. Alert activity is the one user-owned section, needs `analyst`,
and comes back omitted with a line saying so rather than failing the
request, so the sidebar item takes no `hidden`.

It added no table, no column and no index, and unlike [Scans](SCANS.md)
it writes nothing at all — it never calls `getSituationOverview`, so it
carries none of that builder's snapshot-write side effect. It added two
additive repository reads, `listSituationOverviewsInRange` and
`listAlertEventsInRange`, because neither existing list function could
express a window. Three snapshots are the minimum before a window is
summarized; below that the sections report the shortage instead. The two
tables store timestamps in two different formats, which the spec pinned
as the one thing that would have made the feature silently wrong.

See [INSIGHTS.md](INSIGHTS.md).

## 5. Reports — specified

Composes one self-contained document out of state the app has already
computed, over a chosen scope and a chosen window, and hands it back as
a file. Six sections, each one existing call: `situation` from
`getSituationOverview`, `widgets` from
`listLatestWidgetResultsWithDerivedLiquidity`, `insights` from
`getInsights`, `radar` from `getOpportunityRadar`, `portfolio` from
`getPortfolioContext` and `alerts` from `listEventsForSession`. The
`insights` read is what makes a report describe a window rather than a
moment. Reports recalculates nothing; its only rules are section
assembly and serialization.

Minimum role: `viewer` for the four market sections, including the
public-dashboard anonymous visitor. The two personal sections need
`analyst` and come back omitted with a stated line rather than a 403,
the way [Insights](INSIGHTS.md) handles alert activity, so the sidebar
item takes no `hidden` and naming an unreadable section explicitly is
omitted too.

It adds no table. It does inherit the snapshot write: `situation` and
`radar` both go through the overview builder, which persists a row when
state materially changed or fifteen minutes elapsed, exactly as
[Scans](SCANS.md) and [Opportunity Radar](OPPORTUNITY_RADAR.md) do.
That is why the read-only sections are composed before the writing ones
— otherwise a report's `insights` window reads back the snapshot its own
`situation` section just wrote.

Two routes, `/api/reports` and `/api/reports/download`. The download is
the one unwrapped response in the app: a browser download of an `okJson`
envelope is not a report, so a success returns the body alone while an
error is still wrapped, and a client checks the status code rather than
the shape. Three formats — Markdown, JSON and CSV — each chosen because
a pure function can produce it with string concatenation; PDF and
spreadsheet output would need a dependency and therefore a decision.

See [REPORTS.md](REPORTS.md).
