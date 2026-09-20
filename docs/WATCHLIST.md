# Watchlist

Watchlist is one place to keep the symbol and timeframe pairs a user
follows, so each pair's existing deterministic state can be read side by
side instead of one dashboard visit at a time.

It is not a portfolio: no holdings, no quantities, no cost basis, no
profit and loss, and no list of things to buy or sell. Nothing on the
page is an instruction to act.

This document is a full specification of unbuilt behaviour. It is
written to be implemented without further design work: the table, the
routes, the function signatures, the UI states and the test names below
are the contract, and a change to any of them is a change to this file
first.

## Scope

Implemented:

- Nothing yet.

Not implemented:

- `watchlist_items` SQLite table.
- `src/lib/db/repositories/watchlistRepository.ts`.
- `src/lib/services/watchlistContextService.ts`.
- `validateCollectionTimeframe` in `src/lib/services/apiValidation.ts`.
- `GET /api/watchlist`, `POST /api/watchlist`.
- `PUT /api/watchlist/:id`, `DELETE /api/watchlist/:id`.
- `/watchlist` page and the enabled sidebar item.

Out of scope:

- Exchange account linking, API keys, balances or orders.
- Quantities, cost basis, profit and loss, or sizing of any kind.
- Any new collector, widget or external data source.
- Any new calculation: the page reports stored state and how old it is.
- A dashboard callout for the selected symbol (see Open Questions).

## Storage

`watchlist_items` is declared in `src/lib/db/schema.ts`, beside
`portfolio_items`:

```text
id          INTEGER PRIMARY KEY AUTOINCREMENT
user_id     INTEGER NOT NULL  -> users(id) ON DELETE CASCADE
symbol      TEXT NOT NULL
timeframe   TEXT NOT NULL
note        TEXT
position    INTEGER NOT NULL DEFAULT 0
created_at  TEXT NOT NULL DEFAULT (datetime('now'))
updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
UNIQUE(user_id, symbol, timeframe)
```

with one index:

```text
idx_watchlist_items_user_position ON watchlist_items(user_id, position, id)
```

The unique constraint means one user cannot add the same pair twice,
while two users may follow the same pair. `ON DELETE CASCADE` removes a
user's rows with the user, matching `portfolio_items` and `alert_rules`.

Every list query orders `position ASC, id ASC`, so equal positions still
produce one stable order rather than SQLite's insertion order. `position`
is dense and zero-based within a user: a list of four rows holds
`0, 1, 2, 3`.

Timestamps are SQLite `datetime('now')` strings, as everywhere else in
the schema, and `updated_at` is set explicitly on every update.

The matching record types belong in `src/lib/db/types.ts`:

```ts
export interface WatchlistItemRecord {
  id: number;
  userId: number;
  symbol: string;
  timeframe: string;
  note: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type NewWatchlistItem = Omit<WatchlistItemRecord, "id" | "createdAt" | "updatedAt">;
```

There are no migrations. Landing this table means stopping the app,
deleting `data/laripulse.sqlite` plus its `-wal` and `-shm` files and
running `npm run db:init`, and the pull request that touches `schema.ts`
says so.

`assertCompatibleSchema` in `src/lib/db/migrations.ts` needs no new
clause. It rejects only the named legacy shapes — a plan column on
`situation_overviews`, `alert_rules` or `alert_events`, a
`portfolio_items` without `user_id`, and the old two-role `users` check
— and a database that predates this table matches none of them.

`portfolio_items` is untouched. Its `quantity = 0` watched-row
convention keeps working exactly as
[PORTFOLIO.md](PORTFOLIO.md) documents it, and nothing migrates those
rows across. The two tables never read each other: Portfolio stays
`analyst`, Watchlist is signed-in `viewer`, and retiring the convention
is a separate maintainer decision, not part of this work.

## Access

Watchlist rows require a signed-in user of at least `viewer`. Every
service entry point opens with one call:

```ts
const user = requireUser(options.session, "viewer");
```

`requireUser` (`src/lib/auth/access.ts:127`) is the whole check. It runs
`requireRole` first, which throws 401 for an anonymous visitor and 403
for a signed-in user below the role, and then throws 401 again when
`session.userId` is null. That second throw is the case that matters
here: with `public_dashboard` on, `buildSession`
(`src/lib/auth/access.ts:76-87`) hands an anonymous visitor
`role: "viewer"` with `userId: null` and `isAuthenticated: false`, so
`requireRole` alone would let them through to a user-owned table they
cannot own a row in.

This is the first user-owned data available below `analyst`, so the
ownership rule applies without exception, and one step further than the
portfolio precedent: **every repository query is scoped by `user_id` in
SQL**, including the single-row read. `getWatchlistItemForUser(db, { id,
userId })` returns null for another user's row, where
`getPortfolioItemById` (`src/lib/db/repositories/portfolioRepository.ts:114`)
returns the row and leaves the owner check to the service. Both are
safe today; scoping in SQL means a future caller cannot forget the
check.

A row belonging to another user is a **404**, never a 403. The response
does not confirm that the id exists.

## Validation

Reused from `src/lib/services/apiValidation.ts`:

- `validateSymbol(symbol)` — uppercases, trims, and accepts only an
  active symbol in `appConfig.symbols`. Throws `ApiInputError` (400).
- `parseRouteId(value, label)` — a positive integer route id, 400
  otherwise.
- `ApiInputError` — carries the status code that `apiErrorJson` returns.

One function is added there:

```ts
export function validateCollectionTimeframe(timeframe: string) {
  const normalized = timeframe?.trim();

  if (!collectionTimeframes.includes(normalized as (typeof collectionTimeframes)[number])) {
    throw new ApiInputError(`Unsupported timeframe: ${timeframe}`);
  }

  return normalized;
}
```

It restricts to `collectionTimeframes` — `15m`, `1h`, `4h`, `1d`
(`src/lib/config/timeframes.ts:1`) — which is exactly the dashboard's
timeframe selector (`src/components/dashboard/DashboardFoundation.tsx:49`).
The existing `validateOptionalTimeframe` accepts `appConfig.timeframes`,
which also contains `7d`, `30d` and `90d`; those are chart ranges over
daily candles, not collected timeframes, and a watchlist row keyed to
one would have no candles and no Situation Overview of its own. They are
rejected. Scans can reuse this function unchanged.

The service also calls `canAccessSymbol(session, symbol)` before writing,
as `normalizePortfolioInput` does, so a symbol outside the session's
`accessibleSymbols` is a 400 rather than a stored row.

A cross-market symbol such as `DXY` is rejected today, and that is
settled by code rather than preference: `appConfig.symbols` is
`defaultSymbols` only (`src/lib/config/appConfig.ts:9`), and every entry
in `crossMarketSymbols` carries `isActive: false`
(`src/lib/config/symbols.ts:52-174`), so `validateSymbol` already turns
it away. Symbols are configuration: activating one makes it eligible
with no change to this feature.

`note` is trimmed; an empty or whitespace-only note stores `NULL`. Notes
longer than 280 characters are a 400 — a note is a label, not a journal.

## API

Four routes. Reordering rides on `PUT` rather than earning a fifth.

```text
GET    /api/watchlist
POST   /api/watchlist        { symbol, timeframe, note? }        -> 201
PUT    /api/watchlist/:id    { note?, position? }
DELETE /api/watchlist/:id
```

All responses go through `okJson`, so clients read `json.data`. Every
mutation returns the whole refreshed context rather than the single
changed row, matching `src/app/api/portfolio/route.ts`; the client
replaces its state with one payload and never reconciles a partial one.

`symbol` and `timeframe` are immutable after creation. Changing the pair
a row points at is a delete plus an add, which keeps the unique
constraint honest and keeps `PUT` to two fields. A `PUT` carrying
`symbol` or `timeframe` is a 400.

A duplicate `(user_id, symbol, timeframe)` on `POST` is caught before
the insert and thrown as a 400 `ApiInputError` reading
`BTCUSDT 1h is already on your watchlist.` — never a raw
`SQLITE_CONSTRAINT_UNIQUE` escaping through `apiErrorJson` as a 500.

A `position` on `PUT` moves the row and renumbers the user's rows densely
`0..n-1`, all inside one `better-sqlite3` transaction. A position below
`0` or above the last index is clamped, not rejected: the client is
dragging a row, and the end of the list is a legitimate target.

### Request bodies

```ts
export interface WatchlistItemInput {
  symbol: string;
  timeframe: string;
  note?: string | null;
}

export interface WatchlistItemPatch {
  note?: string | null;
  position?: number;
}
```

### Response

`GET`, and the body of every successful mutation:

```jsonc
{
  "status": "ok",
  "data": {
    "items": [
      {
        "id": 3,
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "note": "Watching the range high",
        "position": 0,
        "createdAt": "2026-09-18 08:14:02",
        "updatedAt": "2026-09-19 11:02:41",
        "currentPrice": 64210.5,
        "priceUpdatedAt": "2026-09-19T11:00:00.000Z",
        "situation": {
          "title": "Range-bound with easing momentum",
          "summary": "Price holds the mid-range while momentum cools.",
          "bias": "neutral",
          "riskLevel": "moderate",
          "confidence": "medium",
          "score": 51,
          "riskScore": 44,
          "strongestDriver": { "id": "trend_strength", "label": "Trend Strength", "detail": "…" },
          "generatedAt": "2026-09-19T11:01:12.000Z"
        },
        "watchConditions": [
          {
            "id": "range_high_retest",
            "label": "Range high retest",
            "condition": "Close above 64,900 on 1h",
            "implication": "Range resolution upward",
            "severity": "info"
          }
        ],
        "isStale": false
      }
    ],
    "summary": {
      "itemCount": 1,
      "missingPriceCount": 0,
      "missingOverviewCount": 0,
      "staleCount": 0,
      "newestStateAt": "2026-09-19T11:01:12.000Z",
      "updatedAt": "2026-09-19T11:04:00.000Z"
    },
    "notes": []
  }
}
```

`user_id` never leaves the service; `items[]` carries the stored columns
minus that one, plus the enrichment fields. `situation` is `null` when no
Situation Overview has been persisted for the pair, `currentPrice` and
`priceUpdatedAt` are `null` when no candle is stored, and
`watchConditions` is `[]` in both cases rather than absent.

`notes[]` holds the same kind of plain operational lines the portfolio
context builds — `Missing stored prices for SOLUSDT 4h.` and
`Run Situation Overview for SOLUSDT 4h to enable state context.` — one
line per class of gap, symbols deduplicated.

`newestStateAt` is the newest `generatedAt` across the rows that have
one, or `null`; `updatedAt` is when the response was built.

### Status codes

```text
200  GET, PUT, DELETE on the caller's own row
201  POST
400  unknown symbol, timeframe outside collectionTimeframes, empty body,
     duplicate pair, note too long, symbol or timeframe on PUT,
     unparseable route id
401  anonymous, including the public-dashboard viewer with no user id
403  signed-in but below viewer
404  the id does not exist, or belongs to another user
```

### Curl

```bash
curl http://localhost:3000/api/watchlist

curl -X POST http://localhost:3000/api/watchlist \
  -H "content-type: application/json" \
  -d '{"symbol":"BTCUSDT","timeframe":"1h","note":"Watching the range high"}'

curl -X PUT http://localhost:3000/api/watchlist/3 \
  -H "content-type: application/json" \
  -d '{"position":0}'

curl -X DELETE http://localhost:3000/api/watchlist/3
```

## Layers

### Repository

`src/lib/db/repositories/watchlistRepository.ts`. No access logic, no
enrichment, every statement scoped by `user_id`:

```ts
insertWatchlistItem(db: Database.Database, item: NewWatchlistItem): number

updateWatchlistItem(
  db: Database.Database,
  filters: { id: number; userId: number },
  patch: { note?: string | null; position?: number }
): WatchlistItemRecord | null

deleteWatchlistItemForUser(db: Database.Database, filters: { id: number; userId: number }): boolean

getWatchlistItemForUser(db: Database.Database, filters: { id: number; userId: number }): WatchlistItemRecord | null

listWatchlistItems(db: Database.Database, filters: { userId: number }): WatchlistItemRecord[]

nextWatchlistPosition(db: Database.Database, filters: { userId: number }): number

reindexWatchlistPositions(db: Database.Database, filters: { userId: number }): void
```

`nextWatchlistPosition` returns `COALESCE(MAX(position), -1) + 1` for the
user, so a new row lands at the end. `reindexWatchlistPositions` rewrites
the user's rows to `0..n-1` in `position ASC, id ASC` order and is the
only way `position` is renumbered.

### Service

`src/lib/services/watchlistContextService.ts`. Every function takes an
options object ending in an optional `db`, like the portfolio service, so
tests pass an in-memory database:

```ts
getWatchlistContext(options: { session: AuthSession; db?: Database.Database }): WatchlistContextApi

createWatchlistItemForSession(options: {
  session: AuthSession;
  input: WatchlistItemInput;
  db?: Database.Database;
}): WatchlistItemRecord

updateWatchlistItemForSession(options: {
  session: AuthSession;
  id: number;
  input: WatchlistItemPatch;
  db?: Database.Database;
}): WatchlistItemRecord

deleteWatchlistItemForSession(options: {
  session: AuthSession;
  id: number;
  db?: Database.Database;
}): boolean
```

Enrichment reuses what is already stored, exactly as
`portfolioContextService.ts:203-257` does, with one difference: it reads
**the row's own timeframe**, not portfolio's hardcoded `"1h"`.

- `getCandlesBySymbolTimeframe(db, symbol, timeframe, 1)` gives
  `currentPrice` from the candle's `close` and `priceUpdatedAt` from its
  `closeTime` as ISO. There is no fallback across timeframes: a row for
  `SOLUSDT 4h` with no 4h candle reports a missing price, because
  borrowing a 15m close would misreport what the row is about.
- `getLatestSituationOverview(db, { symbol, timeframe })` gives
  `situation` and `watchConditions`, with `mainDriversJson` and
  `watchConditionsJson` parsed defensively — a parse failure yields `[]`,
  never a thrown request.

No collection is triggered and no external call is made. Reading the
page never writes market data.

The API-facing types (`WatchlistItemApi`, `WatchlistSituationApi`,
`WatchlistContextApi`, `WatchlistItemInput`, `WatchlistItemPatch`) are
declared in the service and re-exported from `src/lib/api/types.ts`,
where the portfolio types already are.

### Routes

`src/app/api/watchlist/route.ts` and
`src/app/api/watchlist/[id]/route.ts`, both `runtime = "nodejs"`. Each
handler reads the session with `getSessionFromRequest`, validates, calls
one service function, and returns `okJson(getWatchlistContext({ session }))`,
wrapping everything in `try`/`catch` with `apiErrorJson`. No repository
import, no enrichment, no ordering logic in a route.

### Components

Render what the API returned. No ordering, no staleness decision, no
access decision that exists only in React.

### Widgets

**No widget changes.** Watchlist membership is a user preference and
never reaches a `WidgetContext`; widgets stay instance-wide and
deterministic.

## Staleness

`isStale` is a service-owned mechanical rule, not a judgement. A row is
stale when its newest stored state is older than **three intervals of
that row's own timeframe**, measured from now:

```text
15m -> 45 minutes      4h -> 12 hours
1h  -> 3 hours         1d -> 3 days
```

Both the candle `closeTime` and the overview `generatedAt` are checked;
the row is stale when either is older than its threshold. A row with no
candle and no overview is **not** marked stale — it is missing, which
`missingPriceCount` and `missingOverviewCount` already report, and
flagging it twice would say the same gap in two ways.

Three intervals is one constant, `STALE_INTERVAL_MULTIPLIER`, stated
here so an implementer does not invent a different one per call site.

Note what is absent: no score, no direction, no confidence, no ranking of
rows. Those belong to widget engines and the Situation Overview, which
this page reads rather than re-derives. Watchlist reports what is stored
and how old it is, and nothing on it predicts, recommends or ranks.

## UI

`/watchlist` is a guarded page:

```tsx
export default async function WatchlistPage() {
  const session = await requirePageSession("/watchlist", { signedIn: true });

  return (
    <SessionProvider session={session}>
      <WatchlistFoundation />
    </SessionProvider>
  );
}
```

`signedIn: true` with the default `minimumRole` of `viewer` is what makes
a public-dashboard anonymous visitor redirect to
`/login?next=%2Fwatchlist` instead of reaching a page with no rows to
show. The shape follows `src/app/portfolio/page.tsx`: a server guard
wrapping `SessionProvider` around a client foundation component in
`src/components/watchlist/WatchlistFoundation.tsx`.

`requirePageSession` goes through `pageInstanceStatus()`, which awaits
`connection()` — so the route must show as `ƒ` and not `○` in
`next build` output. Without it, Next prerenders the guard as a static
redirect to `/setup` and the built instance is permanently broken. Check
the build output before the pull request.

`AppShell`'s `activeItem` union gains `"watchlist"`, and the sidebar item
at `src/components/dashboard/primitives.tsx:360` loses `disabled` and
gains `active: activeItem === "watchlist"` and an `onClick` pushing
`/watchlist`. It also needs `hidden: !isSignedIn`, unlike Alerts and
Portfolio which hide below `analyst`: the page is open to every
signed-in user but has nothing to offer an anonymous one.

`EmptyState`, `GlassCard`, `GlassPanel`, `StatusBadge` and `MetricPill`
come from `src/components/dashboard/primitives.tsx` and are reused rather
than reinvented.

### States

Each one is a state the implementation must render, and the E2E and
manual passes walk them:

| State | What renders |
| --- | --- |
| Loading | `GlassPanel` skeletons, no layout shift when rows arrive |
| Empty | `EmptyState`: what a watchlist is for, and the add form |
| Populated | One `GlassCard` per row, ordered by `position` |
| Missing price | `--` for the price and a muted "no stored candle" line; the row still renders its overview |
| Missing overview | The row renders price only, with the `notes[]` line pointing at Situation Overview |
| Stale | `StatusBadge` reading `Stale`, with the age of the newest stored state beside it |
| Saving | The submit and row controls disable; the list keeps showing the last good payload |
| Duplicate pair | The 400 message renders inline on the form; nothing is added and the list is untouched |
| Load error | An error panel with the message and a retry that refetches `GET /api/watchlist` |
| Role redirect | Anonymous visitors never render the page; the guard redirects to `/login?next=%2Fwatchlist` |

Reordering is explicit: an up and a down control per row, each sending
`PUT /api/watchlist/:id` with the new `position` and replacing state with
the returned context. Ordering is manual by design — deriving it from
stored state would reshuffle the list under the user between visits, and
ranking pairs by how much they moved is
[Opportunity Radar](OPPORTUNITY_RADAR.md)'s job.

Dates render through `formatLocalDateTime` / `replaceIsoDatesWithLocalTime`
from `src/lib/utils/formatDateTime`, as the portfolio page does, so
stored UTC strings are not shown raw.

## Tests

By file and by case:

**`test:db` — `src/lib/db/repositories/watchlistRepository.test.ts`**

- the unique constraint rejects a duplicate `(user_id, symbol, timeframe)`
- two different users may hold the same pair
- `ON DELETE CASCADE` removes a user's rows when the user is deleted
- `listWatchlistItems` returns rows in `position ASC, id ASC`, including
  the tie-break when two rows share a position
- `nextWatchlistPosition` returns `0` on an empty list and `n` on a list
  of `n`
- `reindexWatchlistPositions` produces a dense `0..n-1` after a delete
  leaves a gap
- `getWatchlistItemForUser` returns null for another user's id
- `deleteWatchlistItemForUser` returns false for another user's id and
  leaves the row in place

**`test:services` — `src/lib/services/watchlistContextService.test.ts`**

- enrichment on fixed seeded candles and overviews, asserting exact
  `currentPrice`, `priceUpdatedAt` and `situation` values
- a row reads its own timeframe: a `4h` row does not pick up the `1h`
  overview
- a missing candle yields `currentPrice: null` and the missing-price note
- a missing overview yields `situation: null`, `watchConditions: []` and
  the missing-overview note
- stale flagging at the three-interval boundary per timeframe, on a fixed
  clock
- a row with neither candle nor overview is not flagged stale
- creating appends at the end; a duplicate pair throws `ApiInputError`
  with status 400
- `PUT` with a `position` renumbers densely; an out-of-range position
  clamps to the ends
- `PUT` carrying `symbol` or `timeframe` throws 400
- **cross-user isolation**: user B reading, updating or deleting user A's
  row gets 404, and user A's row is unchanged
- an anonymous session throws 401; a public-dashboard session with
  `role: "viewer"` and `userId: null` also throws 401

**`test:auth` — `src/lib/auth/access.test.ts`**

- anonymous, no public dashboard: 401
- public-dashboard anonymous viewer, `userId` null: `requireUser` throws
  401 where `requireRole` would pass
- a signed-in viewer against an `analyst` requirement: 403

**`test:e2e` — `tests/e2e/watchlist.spec.ts`**

- the sidebar item is enabled and navigates for a signed-in viewer
- add a pair, see it in the list, give it a note, reorder it, remove it
- adding the same pair twice shows the inline duplicate message
- an anonymous visitor on `/watchlist` lands on
  `/login?next=%2Fwatchlist`

Runs across the mobile, tablet and desktop viewports the suite already
configures, with the market API mocked.

## Open Questions

- `schemaSql` runs as `CREATE TABLE IF NOT EXISTS` on every start
  (`src/lib/db/migrations.ts`), so a purely additive table appears on an
  existing database with no reset. Does the standing "delete the database
  and re-init" note still apply to additive-only schema changes, or does
  the project want a narrower rule that distinguishes them?
- Should the dashboard gain a Watchlist callout for the selected symbol,
  mirroring `getPortfolioCalloutForSymbol`? Out of scope as specified
  above; it would be a small follow-on.
- Is there a cap on rows per user? Enrichment costs one candle read and
  one overview read per row, so a hundred rows is a hundred indexed
  point reads on every page load.
