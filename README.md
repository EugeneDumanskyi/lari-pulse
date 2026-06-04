# LariPulse

LariPulse is a local-first market intelligence platform. It turns Binance and FRED market data into explainable signals: SQLite persistence, deterministic indicators, widget engines that explain their own output, and a Next.js dashboard.

## Features

- Binance kline collector with SQLite upserts and source-run logging
- FRED daily collector for gold, oil, Nasdaq 100, S&P 500, dollar, 10-year yield and VIX
- Deterministic indicators: moving averages, RSI, ATR, volume trend, candle structure, support/resistance
- Crypto widgets: Trend Strength, Momentum Exhaustion, Support / Resistance Pressure, Volume Confirmation, Multi-Timeframe Alignment
- Cross-market widgets: Macro Risk Pulse, Dollar Pressure, Gold / Risk Hedge, Oil Inflation Pressure, Nasdaq-Crypto Correlation, Cross-Market Divergence, Risk-On / Risk-Off Regime
- Correlation engine: returns, rolling Pearson correlation, divergence and volatility-adjusted moves
- Liquidations widget built from the Binance USD-M Futures forced-order stream
- Situation Overview: a deterministic summary of bias, risk, drivers, conflicts and watch conditions
- Derivatives Pressure widget from public Binance futures funding, open interest, long/short ratio and basis
- Local alerts, an Opportunity Radar ranking, chart overlays with reasons and a local portfolio/watchlist
- Typed API that never exposes raw source payloads
- Optional in-process scheduler
- User accounts with hashed passwords and database-backed sessions
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
- `liquidation_events`
- `derivatives_metrics`
- `situation_overviews`
- `alert_rules`
- `alert_events`
- `portfolio_items`
- `users`
- `sessions`

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

## Liquidations

The Liquidations widget reads observed forced orders from the Binance USD-M Futures stream:

```text
wss://fstream.binance.com/ws/!forceOrder@arr
```

The collector normalizes events into `liquidation_events` with this side mapping:

```text
SELL forced order = long liquidation
BUY forced order = short liquidation
```

Events are deduplicated by a deterministic event id. A service aggregates them for dashboard intervals (`1h`, `4h`, `1d`, `7d`, `30d`, `90d`). The stream is live-only, so history starts when the local collector starts running; it is not a complete historical liquidation feed. Raw stream payloads never reach the dashboard.

The widget reads normalized summaries through `WidgetContext.marketContext.liquidity`. It never opens WebSockets or reads the database itself.

The liquidity runtime is disabled by default. Enable it in `.env.local`:

```text
LIQUIDITY_RUNTIME_ENABLED=true
LIQUIDATIONS_RETENTION_HOURS=48
BINANCE_LIQUIDATION_STREAM_URL=wss://fstream.binance.com/ws/!forceOrder@arr
```

When enabled, the Next.js process also keeps the stream connected and prunes old events. There is no separate worker. See `docs/LIQUIDATIONS_WIDGET.md` for details.

## Situation Overview

The Situation Overview turns the latest widget results into one deterministic market-state read: bias, risk level, confidence, main drivers, conflicting signals, watch conditions, data warnings and changes since the previous calculation.

```bash
curl "http://localhost:3000/api/overview/situation?symbol=BTCUSDT&timeframe=1h"
```

It follows current widget visibility and never produces buy, sell, entry or exit instructions. Snapshots are stored in `situation_overviews`, so previous-state comparison survives restarts:

```bash
curl "http://localhost:3000/api/overview/situation/history?symbol=BTCUSDT&timeframe=1h"
```

See `docs/SITUATION_OVERVIEW.md`.

## Derivatives Pressure

The `derivatives_pressure` widget reads public Binance USD-M Futures market data: mark price and funding, funding history, open interest, the global long/short account ratio and perpetual basis. It never touches account data, API keys, positions or orders.

Collect it manually:

```bash
curl -X POST http://localhost:3000/api/derivatives/run
```

Symbols locked for the current access level are rejected. Related settings: `BINANCE_FUTURES_BASE_URL` and `BINANCE_DERIVATIVES_HISTORY_LIMIT`.

Normalized rows are stored in `derivatives_metrics` and passed to the widget through `WidgetContext.marketContext.derivatives`. See `docs/DERIVATIVES_CONTEXT.md`.

## Alerts

Local alerts turn Situation Overview changes into in-app events. Supported rule types:

- `situation_bias_changed`
- `risk_level_changed`
- `watch_condition_appeared`
- `widget_direction_changed`
- `score_crossed_threshold`

Open events are deduplicated by rule, symbol, timeframe and trigger until acknowledged. There are no email, push or external notification providers. Manage rules and events at `/alerts`, or through:

```text
GET    /api/alerts/rules
POST   /api/alerts/rules
PUT    /api/alerts/rules/:id
DELETE /api/alerts/rules/:id
GET    /api/alerts/events
POST   /api/alerts/events/:id/ack
POST   /api/alerts/evaluate
```

See `docs/ALERTS.md`.

## Opportunity Radar

`/radar` ranks accessible markets and timeframes by setup quality and by how much attention they deserve, using deterministic Situation Overview fields. It is a review aid, not a trade recommendation engine.

```bash
curl "http://localhost:3000/api/radar/opportunities"
```

See `docs/OPPORTUNITY_RADAR.md`.

## Chart Overlays

The dashboard price chart shows support/resistance zones, the largest observed liquidation and priced Situation Overview watch conditions, each with a reason. Overlays are descriptive levels, not entries, exits or targets.

```bash
curl "http://localhost:3000/api/market/overlays?symbol=BTCUSDT&timeframe=1h"
```

See `docs/CHART_OVERLAYS.md`.

## Portfolio

`/portfolio` keeps a local list of held or watched assets. For each item the service adds the latest stored price, market value, unrealized P/L when an average cost is set, concentration, the latest 1h Situation Overview, its strongest driver and active watch conditions. No exchange sync, balances or trading.

```text
GET    /api/portfolio
POST   /api/portfolio
PUT    /api/portfolio/:id
DELETE /api/portfolio/:id
```

See `docs/PORTFOLIO.md`.

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
curl "http://localhost:3000/api/overview/situation?symbol=BTCUSDT&timeframe=1h"
curl "http://localhost:3000/api/market/overlays?symbol=BTCUSDT&timeframe=1h"
curl "http://localhost:3000/api/radar/opportunities"
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

## Accounts and Access

LariPulse stores user accounts in SQLite. Passwords are hashed with scrypt, and sessions are random tokens kept in an HTTP-only cookie; only a SHA-256 hash of each token is stored.

Access levels:

- **Anonymous and regular users:** BTC and the core widgets. Other markets are visible but locked.
- **Admin:** all configured markets and widgets, plus widget visibility settings.

The admin account is seeded on startup from the environment:

```text
LARIPULSE_ADMIN_EMAIL=admin@example.com
LARIPULSE_ADMIN_PASSWORD=replace-this-before-production
LARIPULSE_SESSION_MAX_AGE_SECONDS=2592000
```

Set a real password before exposing the app to a network.

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"a-long-password"}'

curl -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@example.com","password":"replace-this-before-production"}' \
  -c cookies.txt

curl -b cookies.txt http://localhost:3000/api/auth/session
curl -b cookies.txt -X POST http://localhost:3000/api/auth/logout
```

Widget visibility is stored in SQLite. Dashboard APIs apply it before returning widget results, sorted by the central widget catalog priority. The Settings view (`/settings`) handles sign-up, sign-in, sign-out and widget visibility.

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
npm run test:db
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

## End-to-End Tests

Playwright specs in `tests/e2e/` mock the API layer and check the dashboard on mobile, tablet and desktop viewports:

- `dashboard.spec.ts`: health, routing, widget details and layout overflow
- `widgets.numeric.spec.ts`: numeric formatting for liquidity and correlation widgets
- `crypto-macro.numeric.spec.ts`: numeric formatting for crypto and cross-market widgets

```bash
npx playwright install chromium
npm run test:e2e
```

## Design Constraints

LariPulse uses SQLite, Binance and FRED only. It does not require Redis, PostgreSQL, Docker, Kubernetes, microservices, paid APIs or a model-based prediction layer.

The UI is built with Next.js, TypeScript, Tailwind CSS, shadcn/ui-style primitives, Framer Motion and lucide-react. The visual direction is a dark-mode-first glass interface: translucent panels, backdrop blur, soft borders, calm blue/gray tones and generous spacing.

See `docs/architecture.md` for the design, `docs/widgets.md` for the widget inventory, the feature docs in `docs/` and `CONTRIBUTING.md` for contribution rules.

## Disclaimer

Signals are analytical summaries based on available market data. They are not financial advice and do not guarantee future performance.

## License

MIT
