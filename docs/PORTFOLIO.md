# Local Portfolio Context

Portfolio adds local-only portfolio and watchlist context. It is designed to answer what the current market-state system means for assets the user personally tracks, without exchange sync or trading functionality.

## Scope

Implemented:

- `portfolio_items` SQLite table.
- `GET /api/portfolio`.
- `POST /api/portfolio`.
- `PUT /api/portfolio/:id`.
- `DELETE /api/portfolio/:id`.
- `/portfolio` workspace.
- Dashboard Situation Overview callout when the selected symbol is held or watched.

Out of scope:

- Exchange account linking.
- API keys.
- Balances, positions, orders, or trade execution.
- Position sizing.
- Financial advice language.

## Storage

`portfolio_items` stores:

- `symbol`
- `quantity`
- `average_cost`
- `quote_currency`
- `label`
- `notes`
- `include_in_risk`
- timestamps

Quantity can be `0`; those rows are treated as watched assets.

## Context Service

`src/lib/services/portfolioContextService.ts` reads local portfolio rows and enriches them with:

- latest stored candle close as current price
- market value
- unrealized P/L when average cost is present
- concentration percentage
- latest persisted 1h Situation Overview
- strongest current driver
- active watch conditions

The service applies current local access rules before returning rows. Basic mode only sees BTCUSDT context. Admin/Enterprise mode can use all accessible configured markets.

## API Shape

```bash
curl http://localhost:3000/api/portfolio
curl -X POST http://localhost:3000/api/portfolio \
  -H "content-type: application/json" \
  -d '{"symbol":"BTCUSDT","quantity":0.25,"averageCost":80000,"label":"Core BTC"}'
curl -X PUT http://localhost:3000/api/portfolio/1 \
  -H "content-type: application/json" \
  -d '{"notes":"Updated local note"}'
curl -X DELETE http://localhost:3000/api/portfolio/1
```

Returned context includes item-level enrichment plus a summary with total market value, total unrealized P/L, largest holding, highest risk item, and local notes about missing price or Situation Overview data.

## UI

The `/portfolio` workspace includes:

- local add/edit/delete controls
- market value and P/L summary
- watched item count
- highest-risk holding
- holdings table
- selected-item Situation Overview context
- selected-item watch conditions

The dashboard Situation Overview card displays compact portfolio context for the selected symbol when that symbol exists in `portfolio_items`.

## Limitations

Portfolio context depends on already stored candles and persisted Situation Overview rows. If a symbol has no stored price or no persisted overview, the API returns notes rather than triggering new external collection automatically.
