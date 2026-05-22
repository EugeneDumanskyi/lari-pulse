# LariPulse

LariPulse is a local-first market intelligence platform. It turns Binance market data into explainable crypto signals: SQLite persistence, deterministic indicators, widget engines that explain their own output, and a Next.js dashboard.

## Features

- Binance kline collector with SQLite upserts and source-run logging
- Deterministic indicators: moving averages, RSI, ATR, volume trend, candle structure, support/resistance
- Five explainable widgets: Trend Strength, Momentum Exhaustion, Support / Resistance Pressure, Volume Confirmation, Multi-Timeframe Alignment
- Typed API that never exposes raw exchange payloads
- Optional in-process scheduler
- Dashboard with symbol and timeframe selectors, price chart, widget cards and details, and warnings for stale, missing, failed, low-confidence or conflicting data

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

Initialize the schema and seed the default crypto symbols:

```bash
npm run db:init
```

The initializer creates these tables:

- `symbols`
- `candles`
- `widget_results`
- `source_runs`

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

To collect candles without recalculating widgets:

```bash
curl -X POST http://localhost:3000/api/collect/run \
  -H "content-type: application/json" \
  -d '{"symbols":["BTCUSDT"],"timeframes":["1h"],"limit":2,"calculateWidgets":false}'
```

The endpoint returns normalized collection metadata. It does not expose raw Binance response rows.

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

## Widgets

The generic widget contract, registry and runner live under `src/lib/widgets/`. The runner validates every `WidgetResult` before optionally saving it to SQLite.

Crypto widget engines:

- Trend Strength
- Momentum Exhaustion
- Support / Resistance Pressure
- Volume Confirmation
- Multi-Timeframe Alignment

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
```

```bash
npm run test:services
```

## Scheduler

The scheduler uses a simple in-process interval, not Redis, BullMQ or a separate worker service. It is disabled by default for predictable local development.

Enable it in `.env.local`:

```text
SCHEDULER_ENABLED=true
COLLECT_INTERVAL_SECONDS=60
```

When the Next.js server starts, `src/instrumentation.ts` initializes SQLite and starts the scheduler if enabled. Each cycle runs collection, recalculates widgets, stores widget results, logs the cycle in `source_runs`, and skips a new cycle if the previous one is still running.

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

5. Run a small collection plus widget calculation:

   ```bash
   curl -X POST http://localhost:3000/api/collect/run \
     -H "content-type: application/json" \
     -d '{"symbols":["BTCUSDT"],"timeframes":["1h"],"limit":120}'
   ```

6. Open `http://localhost:3000/dashboard` and check that the controls, chart, widget cards, details and warnings render.

Verification suite:

```bash
npm run test:indicators
npm run test:widgets
npm run test:services
npm run test:scheduler
npm run lint
npm run typecheck
npm run build
```

## Design Constraints

LariPulse uses SQLite and Binance only. It does not require Redis, PostgreSQL, Docker, Kubernetes, microservices, paid APIs or a model-based prediction layer.

The UI is built with Next.js, TypeScript, Tailwind CSS, shadcn/ui-style primitives, Framer Motion and lucide-react. The visual direction is a dark-mode-first glass interface: translucent panels, backdrop blur, soft borders, calm blue/gray tones and generous spacing.

See `docs/architecture.md` for the design and `CONTRIBUTING.md` for contribution rules.

## Disclaimer

Signals are analytical summaries based on available market data. They are not financial advice and do not guarantee future performance.

## License

MIT
