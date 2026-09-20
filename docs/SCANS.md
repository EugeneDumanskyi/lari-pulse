# Scans

Scans runs an explicit, user-stated filter across the configured symbols
and timeframes and returns the pairs whose stored deterministic state
matches, naming the conditions that matched and the ones that did not.

It is not a strategy backtester, not a signal generator, not a ranking,
and not a source of trade entries, exits, price targets or sizing. The
boundary against [Opportunity Radar](OPPORTUNITY_RADAR.md) is the point
of the feature: Radar answers "what deserves attention right now", and
Scans answers "which markets match the conditions I named".

## Scope

Implemented:

- Nothing yet.

Not implemented:

- `src/lib/services/scanService.ts`.
- `GET /api/scans/run`.
- `/scans` page and the enabled sidebar item.

Out of scope:

- Historical replay, backtesting or performance statistics.
- Ranking or scoring of the matches beyond what the stored state says.
- New collectors, widgets or external data sources.

## Storage

None. A scan computes on request from `widget_results` and
`situation_overviews`, which is why it needs no database reset to land.

Saved scan definitions are a separate, later addition: a user-owned
`scan_definitions` table holding `user_id`, a name, the encoded filter
and timestamps, unique per user and name, with `ON DELETE CASCADE` and
an index led by `user_id`. Because there are no migrations, adding it
would require deleting `data/laripulse.sqlite` plus `-wal`/`-shm` and
running `npm run db:init`, and the pull request touching `schema.ts`
would say so.

## Access

Minimum role `viewer`. Market data is instance-wide, so a scan has the
same reach as Radar: anonymous visitors get results when the public
dashboard is on, and 401 otherwise; an authenticated session below
`viewer` gets 403. Symbol access goes through `validateSymbolAccess`, so
a scan cannot widen what a session may read.

## Layers

- `scanService` owns predicate evaluation and reuses the Situation
  Overview builder rather than re-deriving state. It must not trigger
  alert evaluation while scanning — the same guardrail
  `opportunityRadarService` already carries, for the same reason:
  opening a page must not manufacture alert events.
- The route validates the filter payload with the helpers in
  `src/lib/services/apiValidation.ts` — `validateSymbol`,
  `validateOptionalTimeframe`, `validateSymbolAccess`,
  `validateOptionalLimit` — and then calls the service.
- No predicate logic in the route handler, and none in React.
- Symbols and timeframes come from `src/lib/config/symbols.ts` and
  `appConfig.timeframes`; neither is hardcoded in the service.

## API

```text
GET /api/scans/run?symbols=BTCUSDT,ETHUSDT&timeframes=1h,4h&filter=<encoded>
```

The response goes through `okJson`. Each item names:

```text
symbol
timeframe
matchedConditions
unmatchedConditions
confidence
updatedAt
```

plus a summary of how many pairs were examined, how many matched, and
which requested pairs had no stored state to examine.

## UI

A guarded `/scans` page through `requirePageSession`, which uses
`pageInstanceStatus()` and so awaits `connection()`. The route must show
as `ƒ` and not `○` in `next build` output, or the guard is prerendered
as a static redirect to `/setup`.

## Tests

- `test:services` — predicate evaluation on fixed sample state, with
  exact expected matches, because the engine is deterministic.
- `test:auth` — the 401 and 403 paths, and that a scan cannot reach a
  symbol the session may not read.
- `test:e2e` — building a filter and reading the results on the page.

## Open Questions

- What is the filter vocabulary: a closed set of conditions over
  existing Situation Overview and widget result fields, or a free-form
  expression that needs its own parser and its own validation surface?
- When a requested symbol has no stored results at all, does the scan
  report it as missing in the summary, or is a scan over an uncollected
  symbol rejected at validation?
