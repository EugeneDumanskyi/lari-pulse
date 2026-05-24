# LariPulse

LariPulse is a local-first market intelligence platform. It turns Binance and FRED market data into explainable signals: SQLite persistence, deterministic indicators, widget engines that explain their own output, and a Next.js dashboard.

## Features

- Binance kline collector with SQLite upserts and source-run logging
- FRED daily collector for gold, oil, Nasdaq 100, S&P 500, dollar, 10-year yield and VIX
- Deterministic indicators: moving averages, RSI, ATR, volume trend, candle structure, support/resistance
- Crypto widgets: Trend Strength, Momentum Exhaustion, Support / Resistance Pressure, Volume Confirmation, Multi-Timeframe Alignment
- Cross-market widgets: Macro Risk Pulse, Dollar Pressure, Gold / Risk Hedge, Oil Inflation Pressure, Nasdaq-Crypto Correlation, Cross-Market Divergence, Risk-On / Risk-Off Regime
- Correlation engine: returns, rolling Pearson correlation, divergence and volatility-adjusted moves
- Typed API that never exposes raw source payloads
- Optional in-process scheduler
- Dashboard, Markets directory and Settings views

## Setup

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
http://localhost:3000/dashboard
http://localhost:3000/api/health
```

## SQLite

Data is stored locally in SQLite. The default database path is:

```text
data/laripulse.sqlite
```

Initialize the schema and seed the default symbols:

```bash
npm run db:init
```

The initializer creates these tables:

- `symbols`
- `candles`
- `widget_results`
- `source_runs`
- `widget_settings`

To reset the local database, stop the app and remove `data/laripulse.sqlite` plus any adjacent SQLite WAL/SHM files, then run `npm run db:init` again.

## Binance Collection

Start the app, then trigger a manual collection run:

```bash
curl -X POST http://localhost:3000/api/collect/run
```

By default this fetches `BINANCE_KLINE_LIMIT` candles for the configured symbols and timeframes, then recalculates and stores widget results. For a smaller smoke test:

```bash
curl -X POST http://localhost:3000/api/collect/run \
  -H "content-type: application/json" \
  -d '{"symbols":["BTCUSDT"],"timeframes":["1h"],"limit":2}'
```

To collect candles without recalculating widgets, add `"calculateWidgets":false` to the body.

The endpoint returns normalized collection metadata. It does not expose raw Binance response rows.

## FRED Collection

Cross-market data comes from FRED CSV series, which need no API key. The configured assets are `XAUUSD`, `WTI`, `NASDAQ100`, `SPX`, `DXY`, `US10Y` and `VIX`, on the `1d` timeframe only.

| LariPulse symbol | FRED series | Note |
| --- | --- | --- |
| `XAUUSD` | `NASDAQQGLDI` | Gold price index proxy, not spot XAU/USD |
| `WTI` | `DCOILWTICO` | WTI crude oil daily spot price |
| `NASDAQ100` | `NASDAQ100` | Nasdaq 100 daily index |
| `SPX` | `SP500` | S&P 500 daily index |
| `DXY` | `DTWEXBGS` | Broad U.S. dollar index proxy, not ICE DXY |
| `US10Y` | `DGS10` | 10-year Treasury constant maturity yield |
| `VIX` | `VIXCLS` | CBOE volatility index |

Run a manual FRED collection:

```bash
npm run collect:fred
```

This seeds the cross-market symbol metadata, fetches daily observations, normalizes them into the shared `candles` table and logs the run in `source_runs`.

## Indicators

Pure deterministic indicator functions live under `src/lib/indicators/`:

- moving average
- RSI
- ATR
- volume trend
- candle structure
- support/resistance zones

```bash
npm run test:indicators
```

## Correlations

`src/lib/correlations/` calculates from stored candles:

- close-to-close percentage returns
- date-aligned rolling Pearson correlation
- short-term compounded-return divergence
- volatility-adjusted latest movement

```bash
npm run test:correlations
```

## Widgets

The generic widget contract, registry and runner live under `src/lib/widgets/`. The runner validates every `WidgetResult` before optionally saving it to SQLite.

Crypto widget engines:

- Trend Strength
- Momentum Exhaustion
- Support / Resistance Pressure
- Volume Confirmation
- Multi-Timeframe Alignment

Cross-market widget engines:

- `macro_risk_pulse`
- `dollar_pressure`
- `gold_risk_hedge`
- `oil_inflation_pressure`
- `nasdaq_crypto_correlation`
- `cross_market_divergence`
- `risk_regime`

Cross-market engines read multi-asset candles, correlation pairs and regime hints from `WidgetContext.marketContext`. Helpers in `src/lib/widgets/marketContext.ts` build and read that context, so engines never invent their own shapes.

The cross-market API calculates from stored SQLite candles and correlation results on request. A scheduled refresh can also persist the latest `CROSS_MARKET` widget rows for history.

See `docs/widgets.md` for the full inventory.

```bash
npm run test:widgets
```

## API

The API routes return typed, frontend-safe JSON and parse stored `details_json` and `sources_json` into structured objects.

```bash
curl "http://localhost:3000/api/symbols"
curl "http://localhost:3000/api/market/overview?symbol=BTCUSDT&timeframe=1h"
curl "http://localhost:3000/api/runtime/status"
curl "http://localhost:3000/api/widgets/latest?symbol=BTCUSDT&timeframe=1h"
curl "http://localhost:3000/api/widgets/history?symbol=BTCUSDT&widgetId=trend_strength&limit=10"
curl "http://localhost:3000/api/widgets/cross-market?timeframe=1d"
```

```bash
npm run test:services
```

## Dashboard

```text
http://localhost:3000/dashboard
```

The dashboard renders real API data from SQLite. Use the manual collection endpoint or enable the scheduler to populate crypto candles and widget results. Run `npm run collect:fred` to populate daily cross-market candles before reviewing the cross-market section.

Widget cards reserve the same height for both summary and detail faces, so opening details does not resize the grid. Detail rows are formatted into readable labels and compact summaries instead of raw JSON.

## Local Access Mode

LariPulse ships with a simple local access model. Anonymous visitors get a limited view: BTC is available, other markets are visible but locked, and only the core widgets are shown. Signing in as the local admin unlocks all configured markets and widgets.

Local admin credentials default to:

```text
username: admin
password: 123
```

Override them with `LARIPULSE_ADMIN_USERNAME`, `LARIPULSE_ADMIN_PASSWORD` and `LARIPULSE_AUTH_SECRET`. This is local-development auth, not production account security.

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"username":"admin","password":"123"}'

curl http://localhost:3000/api/auth/session
curl -X POST http://localhost:3000/api/auth/logout
```

The session is stored in an HTTP-only cookie.

Widget visibility is stored in SQLite. Dashboard APIs apply it before returning widget results, sorted by the central widget catalog priority. The Settings view (`/settings`) handles sign-in, sign-out and widget visibility.

```bash
curl http://localhost:3000/api/settings/widgets

curl -X PUT http://localhost:3000/api/settings/widgets \
  -H "content-type: application/json" \
  -d '{"enabledWidgetIds":["trend_strength","momentum_exhaustion","risk_regime"]}'
```

## Markets

```text
http://localhost:3000/markets
```

The Markets view groups crypto, index, commodity, FX/yield and volatility series. It shows freshness, source notes, local candle count, a compact chart and related widget results filtered by current visibility.

```text
GET /api/markets
GET /api/markets/overview?symbol=BTCUSDT
```

## Scheduler

The scheduler uses a simple in-process interval, not Redis, BullMQ or a separate worker service. It is disabled by default for predictable local development.

Enable it in `.env.local`:

```text
SCHEDULER_ENABLED=true
COLLECT_INTERVAL_SECONDS=60
PHASE2_SCHEDULER_ENABLED=false
PHASE2_REFRESH_INTERVAL_SECONDS=86400
```

When the Next.js server starts, `src/instrumentation.ts` initializes SQLite and starts the scheduler if enabled. Each cycle runs Binance collection, recalculates widgets, stores widget results, logs the cycle in `source_runs`, and skips a new cycle if the previous one is still running.

When `PHASE2_SCHEDULER_ENABLED=true`, the same scheduler also runs a guarded cross-market refresh when due:

- FRED daily collection
- cross-market correlation calculation
- cross-market widget calculation
- persisted `CROSS_MARKET` widget results

The refresh defaults to once per day and checks the latest successful FRED run, so a server restart does not trigger duplicate collection.

```bash
npm run test:scheduler
```

## Manual Testing

1. `npm install`
2. `npm run db:init`
3. `npm run dev`
4. Check health and runtime status:

   ```bash
   curl "http://localhost:3000/api/health"
   curl "http://localhost:3000/api/runtime/status"
   ```

5. Collect data:

   ```bash
   curl -X POST http://localhost:3000/api/collect/run \
     -H "content-type: application/json" \
     -d '{"symbols":["BTCUSDT"],"timeframes":["1h"],"limit":120}'
   npm run collect:fred
   ```

6. Open `http://localhost:3000/dashboard` and check that the controls, chart, widget cards, details and warnings render.

Verification suite:

```bash
npm run test:indicators
npm run test:correlations
npm run test:collectors
npm run test:widgets
npm run test:services
npm run test:scheduler
npm run lint
npm run typecheck
npm run build
```

## Design Constraints

LariPulse uses SQLite, Binance and FRED only. It does not require Redis, PostgreSQL, Docker, Kubernetes, microservices, paid APIs or a model-based prediction layer.

The UI is built with Next.js, TypeScript, Tailwind CSS, shadcn/ui-style primitives, Framer Motion and lucide-react. The visual direction is a dark-mode-first glass interface: translucent panels, backdrop blur, soft borders, calm blue/gray tones and generous spacing.

See `docs/architecture.md` for the design, `docs/widgets.md` for the widget inventory and `CONTRIBUTING.md` for contribution rules.

## Disclaimer

Signals are analytical summaries based on available market data. They are not financial advice and do not guarantee future performance.

## License

MIT
