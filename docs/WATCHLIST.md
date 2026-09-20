# Watchlist

Watchlist is one place to keep the symbol and timeframe pairs a user
follows, so each pair's existing deterministic state can be read side by
side instead of one dashboard visit at a time.

It is not a portfolio: no holdings, no quantities, no cost basis, no
profit and loss, and no list of things to buy or sell. Nothing on the
page is an instruction to act.

## Scope

Implemented:

- Nothing yet.

Not implemented:

- `watchlist_items` SQLite table.
- `src/lib/db/repositories/watchlistRepository.ts`.
- `src/lib/services/watchlistContextService.ts`.
- `GET /api/watchlist`, `POST /api/watchlist`.
- `PUT /api/watchlist/:id`, `DELETE /api/watchlist/:id`.
- `/watchlist` page and the enabled sidebar item.

Out of scope:

- Exchange account linking, API keys, balances or orders.
- Quantities, cost basis, profit and loss, or sizing of any kind.
- Any new collector, widget or external data source.

## Storage

A dedicated user-owned table, `watchlist_items`, holding:

- `user_id`
- `symbol`
- `timeframe`
- `note`
- an ordering column
- created and updated timestamps

Unique on `(user_id, symbol, timeframe)`, so the same pair cannot be
added twice by one user while two users may follow the same pair. The
`user_id` column is a foreign key to `users(id)` with `ON DELETE
CASCADE`, and there is an index led by `user_id`, matching how
`portfolio_items` and `alert_rules` are declared in
`src/lib/db/schema.ts`.

There are no migrations. Landing this table means stopping the app,
deleting `data/laripulse.sqlite` plus its `-wal` and `-shm` files and
running `npm run db:init`, and the pull request that touches
`schema.ts` says so.

`portfolio_items` is untouched: its `quantity = 0` watched-row
convention keeps working exactly as documented in
[PORTFOLIO.md](PORTFOLIO.md). Once Watchlist exists that convention
becomes redundant, but retiring it is a maintainer decision recorded
under Open Questions, not a silent removal.

## Access

Watchlist rows require a signed-in `viewer`. Services call
`requireRole(session, "viewer")` from `src/lib/auth/access.ts` and also
check that the session is authenticated, because anonymous visitors on a
public dashboard own no rows and are excluded. Anonymous requests get
401; an authenticated session below the role gets 403.

This is the first user-owned data available below `analyst`, so the
usual rule applies without exception: every query filters by
`session.userId`, and a test proves one user cannot read, change or
delete another user's rows.

## Layers

- `watchlistRepository` owns the queries, every one of them scoped by
  `user_id`.
- `watchlistContextService` enriches rows for display, reusing the
  latest persisted Situation Overview and the latest stored candle close
  the way `portfolioContextService` already does. It creates no new
  collection and no new external call.
- Route handlers validate input and call the service.
- Components render what the API returned.

No widget changes. Watchlist membership is a user preference and never
reaches a `WidgetContext`; widgets stay instance-wide and deterministic.

## API

```text
GET    /api/watchlist
POST   /api/watchlist
PUT    /api/watchlist/:id
DELETE /api/watchlist/:id
```

All responses go through `okJson`, so clients read `json.data`. The
collection response carries the enriched items plus a summary — how many
pairs are followed, how many are missing a stored price or a persisted
overview, and when the newest underlying state was calculated.

## UI

A guarded `/watchlist` page through `requirePageSession("/watchlist",
{ signedIn: true })`, which goes through `pageInstanceStatus()` and so
awaits `connection()`. The route must show as `ƒ` and not `○` in
`next build` output, otherwise the guard is prerendered as a static
redirect to `/setup` and the built instance is broken.

The `activeItem` union in `AppShell` gains `"watchlist"`, and the
sidebar item stops being `disabled`.

## Tests

- `test:db` — repository behaviour, including the unique constraint and
  the cascade on user deletion.
- `test:services` — enrichment on fixed sample rows, plus cross-user
  isolation.
- `test:auth` — the anonymous 401 and under-privileged 403 paths.
- `test:e2e` — add, reorder, note and remove on the guarded page.

## Open Questions

- Does the `portfolio_items` `quantity = 0` watched-row convention get
  retired once Watchlist exists, and if so does anything migrate the
  rows, given that there are no migrations?
- Is ordering manual, with an explicit user-set position, or derived
  from stored state such as recency of change?
- May a watchlist row reference a cross-market symbol such as `DXY`, or
  only the Binance pairs in `src/lib/config/symbols.ts`?
