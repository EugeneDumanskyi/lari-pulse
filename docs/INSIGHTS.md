# Insights

Insights is a deterministic read of what has changed across a window,
assembled only from already persisted snapshots: bias and risk
transitions, drivers that kept recurring, conflicts that persisted, and
the alert events that were raised.

It is not a model, not generated prose, not a forecast, and not advice.
Every sentence is a template filled from stored values, and every
statement is traceable to the rows it came from.

## Scope

Implemented:

- Nothing yet.

Not implemented:

- `src/lib/services/insightsService.ts`.
- `GET /api/insights`.
- `/insights` page and the enabled sidebar item.

Out of scope:

- Any model in the text path; no generated or paraphrased wording.
- Any statement about what happens next, or about what to do.
- New collectors, widgets or external data sources.

## Storage

None. Insights reads `situation_overviews`, `widget_results` and
`alert_events` and composes on request, so it needs no database reset to
land.

## Access

Minimum role `viewer` for the instance-wide market content, which is
everything drawn from `situation_overviews` and `widget_results`.

Sections that draw on a user's own data are separate: an alert-activity
section reads `alert_events`, which is user-owned, so it requires an
authenticated session, filters by `session.userId`, and is omitted
rather than broadened for an anonymous public-dashboard visitor. The
service states per section which category it is in. Anonymous requests
for a user-owned section get 401; a session below the role gets 403.

## Layers

- `insightsService` owns window aggregation — selecting the snapshots in
  range, detecting transitions, counting recurrence — and owns template
  selection.
- The route validates parameters and calls the service.
- Components render the returned sections and nothing else; no text is
  assembled in React.

## API

```text
GET /api/insights?symbol=BTCUSDT&timeframe=1h&range=7d
```

`range` reuses the existing `validateOptionalRange` allowed set — `1d`,
`7d`, `30d`, `90d` — rather than inventing a second range vocabulary.
`symbol` goes through `validateSymbol` and `validateSymbolAccess`,
`timeframe` through `validateOptionalTimeframe`.

The response goes through `okJson` and carries the sections, each with
its templated lines, the stored values behind them, the row identifiers
they came from, and the window actually covered, which can be narrower
than the requested range.

## UI

A guarded `/insights` page through `requirePageSession`, which uses
`pageInstanceStatus()` and so awaits `connection()`. The route must show
as `ƒ` and not `○` in `next build` output, or the guard is prerendered
as a static redirect to `/setup`.

## Tests

- `test:services` — fixed snapshot rows in, exact expected text out,
  including the sparse-window and empty-window cases.
- `test:auth` — the 401 and 403 paths, and that one user's alert
  activity never appears in another user's insights.
- `test:e2e` — the page across a range change.

## Open Questions

- `situation_overviews` only persists on material change or when the
  snapshot interval has elapsed, so a window can hold very few rows or
  none. What does a sparse window report?
- Is there a minimum row count below which Insights declines to
  summarize and says so, rather than over-reading two snapshots as a
  trend?
