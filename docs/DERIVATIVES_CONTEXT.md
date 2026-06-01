# Derivatives Pressure Context

Derivatives Pressure adds local derivatives context from public Binance USD-M Futures market-data endpoints.

## Scope

Implemented:

- `derivatives_metrics` SQLite table.
- Binance derivatives collector in `src/lib/collectors/binanceDerivativesCollector.ts`.
- Manual collection service and endpoint: `POST /api/derivatives/run`.
- Widget context builder: `src/lib/services/derivativesWidgetContextService.ts`.
- Crypto widget: `derivatives_pressure`.

Not implemented:

- Exchange account linking.
- API keys or private account data.
- Positions, balances, order history, or sizing.
- External notifications or queues.

## Data Sources

The collector uses public Binance USD-M Futures endpoints:

```text
GET /fapi/v1/premiumIndex
GET /fapi/v1/fundingRate
GET /fapi/v1/openInterest
GET /futures/data/openInterestHist
GET /futures/data/globalLongShortAccountRatio
GET /futures/data/basis
```

Official Binance docs:

- Mark Price: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Mark-Price
- Funding Rate History: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Get-Funding-Rate-History
- Open Interest: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest
- Open Interest Statistics: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Open-Interest-Statistics
- Long/Short Ratio: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Long-Short-Ratio
- Basis: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Basis

Source-run identity:

```text
source: binance_futures
collector_id: binance_derivatives
```

Config:

```env
BINANCE_FUTURES_BASE_URL=https://fapi.binance.com
BINANCE_DERIVATIVES_HISTORY_LIMIT=30
```

## Manual Collection

```bash
curl -X POST http://localhost:3000/api/derivatives/run \
  -H "content-type: application/json" \
  -d '{"symbols":["BTCUSDT","ETHUSDT","SOLUSDT"],"periods":["1h"],"historyLimit":30}'
```

`periods` must be configured app timeframes. Derived toolbar ranges map to the underlying source period where needed.

## Widget Behavior

`derivatives_pressure` consumes `WidgetContext.marketContext.derivatives`.

It evaluates:

- funding-rate pressure
- long/short account skew
- open-interest expansion or contraction
- perpetual basis premium or discount
- stale/missing local data

Possible direction examples:

```text
crowded_longs
crowded_shorts
leverage_cooling
perp_premium
perp_discount
balanced
unknown
storage_error
```

The widget is descriptive context only. It should be read as futures pressure around the current market state, not as a trade entry, exit, target, or sizing recommendation.
