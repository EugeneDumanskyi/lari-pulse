# LariPulse Architecture

## Product Definition

LariPulse is a modular market intelligence platform for investors and traders.

It is not a generic dashboard of isolated values such as price, RSI, market cap or volume. It is an explainable signal system where each widget behaves like a small analytical engine.

Each widget:

1. Receives normalized market data.
2. Calculates several indicators or derived values.
3. Combines those values into a signal.
4. Produces a structured JSON result.
5. Shows a short summary in the UI.
6. Provides expandable details explaining why the signal was produced.

The system should help answer questions like:

> Is something important changing for BTC, ETH or SOL right now?

> Is a bullish move confirmed by volume and multi-timeframe structure, or is it becoming overheated?

> Is price approaching, rejecting, breaking or losing an important level?

## Scope

The first release is a crypto-only signal system:

```text
collector → SQLite → indicator engine → widget engine → API → UI
```

It deliberately avoids heavy infrastructure:

```text
No PostgreSQL
No Redis
No Kubernetes
No microservices
No paid APIs
No AI prediction layer
```

It should be easy to run locally, easy to debug and easy to extend. Cross-market data (oil, gold, Nasdaq, DXY, rates) can be added later without changing the core pipeline.

### Assets

```text
BTCUSDT
ETHUSDT
SOLUSDT
```

Assets are configuration, not code. Adding `BNBUSDT` or another pair should not require changing business logic.

### Timeframes

```text
15m
1h
4h
1d
```

These cover short-term, swing and higher-timeframe structure.

### Data Source

```text
Binance Spot API (public klines, no key required)
```

Collectors fetch and normalize data. They do not contain signal logic.

## Data Flow

```text
Binance API
  ↓
Collector (fetch, validate, normalize, store, log)
  ↓
SQLite candles table
  ↓
Indicator engine
  ↓
Widget engines
  ↓
widget_results table
  ↓
API
  ↓
Dashboard UI
```

## Stack

```text
Frontend:   Next.js, React, TypeScript, Tailwind CSS,
            shadcn/ui-style primitives, Framer Motion, lucide-react
Backend:    Next.js route handlers, TypeScript
Database:   SQLite (better-sqlite3)
Scheduler:  simple in-process interval
Source:     Binance API
```

One Next.js project holds both the UI and the API.

### Why SQLite

```text
No database server
No Docker required
Single file database
Easy backup, reset and inspection
Good enough for the expected data volume
```

Default path:

```text
data/laripulse.sqlite
```

Move to PostgreSQL only when there is a clear need: concurrent writers, multiple backend instances or large-scale time-series storage.

### Why No Redis

Redis is useful for distributed job queues, pub/sub, shared state across instances and high-frequency caching. A single local process needs none of that. SQLite for persistence, an in-memory cache for the current process, a simple scheduler and API polling from the UI are enough.

## Module Boundaries

```text
collectors:  fetch and normalize data
db:          schema and queries
indicators:  reusable pure calculations
widgets:     signal engines
services:    orchestration
api routes:  thin HTTP layer
components:  UI rendering
scheduler:   periodic execution
```

Layers must not be mixed. Route handlers call services; services call repositories, collectors, indicators and widgets.

Planned layout:

```text
src/
  app/
    dashboard/page.tsx
    api/
      health/route.ts
      symbols/route.ts
      widgets/latest/route.ts
      widgets/history/route.ts
      collect/run/route.ts
  components/dashboard/
  lib/
    config/
    db/
      repositories/
    collectors/
    indicators/
    widgets/
    services/
    scheduler/
    utils/
```

## Database

### symbols

```text
id, symbol, asset_type, base_asset, quote_asset, source,
is_active, created_at, updated_at
```

### candles

```text
id, symbol, timeframe, open_time, close_time,
open, high, low, close, volume, source, created_at

unique(symbol, timeframe, open_time, source)
index(symbol, timeframe, open_time)
```

### widget_results

```text
id, widget_id, symbol, timeframe, score, direction, confidence,
severity, summary, details_json, sources_json, created_at

index(widget_id, symbol, timeframe, created_at)
index(symbol, timeframe, created_at)
```

### source_runs

```text
id, source, collector_id, status, started_at, finished_at,
error_message, metadata_json
```

Every collector and scheduler run is logged here, including failures.

## Widget Contract

```ts
export interface WidgetEngine {
  id: string;
  name: string;
  description: string;
  requiredInputs: string[];
  run(context: WidgetContext): Promise<WidgetResult>;
}

export interface WidgetContext {
  symbol?: string;
  timeframe?: string;
  candles?: Candle[];
  indicators?: Record<string, unknown>;
  now: Date;
}

export interface WidgetResult {
  widgetId: string;
  symbol?: string;
  timeframe?: string;
  score: number;          // 0-100
  direction: string;
  confidence: number;     // 0-1
  severity: "low" | "medium" | "high";
  summary: string;
  details: Record<string, unknown>;
  sources: SourceRef[];
  updatedAt: string;      // ISO timestamp
}

export interface SourceRef {
  source: string;
  type: string;
  symbol?: string;
  timeframe?: string;
  updatedAt?: string;
}
```

The frontend renders any widget generically from this structure. The runner validates every result before it is stored.

## Widgets

### Trend Strength

Is the asset trending up, down or sideways, and how strong is the trend?

Inputs: price vs MA7 and MA30, MA7 vs MA30, higher highs/lows or lower highs/lows, recent candle structure.

```json
{
  "widgetId": "trend_strength",
  "symbol": "SOLUSDT",
  "timeframe": "1h",
  "score": 74,
  "direction": "bullish",
  "confidence": 0.71,
  "severity": "medium",
  "summary": "SOL remains in an upward trend on the 1h timeframe, supported by price staying above MA7 and MA30.",
  "details": {
    "priceVsMA7": "above",
    "priceVsMA30": "above",
    "ma7VsMA30": "above",
    "structure": "higher_lows"
  }
}
```

### Momentum Exhaustion

Is a move still healthy or becoming overheated?

Inputs: RSI, distance from MA7 and MA30, candle body size, wick behavior, volume change.

### Support / Resistance Pressure

Is price approaching, rejecting, breaking or losing important levels?

Inputs: recent swing highs and lows, repeated rejection zones, breakout and breakdown attempts, distance to nearest support and resistance.

### Volume Confirmation

Is recent price movement supported by volume?

Inputs: current volume vs average, volume trend, volume on green vs red candles, breakout volume.

### Multi-Timeframe Alignment

Do short-term, medium-term and higher-timeframe signals agree or conflict?

Inputs: trend and momentum per timeframe across 15m, 1h, 4h and 1d.

## Confidence

Confidence falls when:

```text
data is insufficient or stale
indicators disagree
timeframes conflict
candle structure is choppy
volume is low
```

Confidence rises when price, moving averages, structure, volume and timeframes agree.

## API

```text
GET  /api/health
GET  /api/symbols
GET  /api/market/overview?symbol=BTCUSDT&timeframe=1h
GET  /api/runtime/status
GET  /api/widgets/latest?symbol=SOLUSDT
GET  /api/widgets/latest?symbol=SOLUSDT&timeframe=1h
GET  /api/widgets/history?symbol=SOLUSDT&widgetId=trend_strength
POST /api/collect/run
```

Responses are typed and never expose raw Binance payloads. Query parameters are validated.

## Scheduler

```text
On start:
  initialize SQLite
  ensure tables exist
  seed configured symbols
  start scheduler if enabled

Every interval:
  fetch latest Binance candles
  upsert into SQLite
  calculate widgets
  store widget_results
```

The scheduler runs in-process, is disabled by default, skips a cycle if the previous one is still running, and logs failures without crashing the app.

## Dashboard

```text
Header
Symbol selector
Timeframe selector
Market summary panel
Price chart
Widget grid
Widget details drawer
```

Each widget card shows title, score, direction, confidence, severity, short summary, updated time and a details button. The details view shows the full summary, indicator values, source references, timestamps and any conflicts or warnings. Stale or missing data is always visible.

The interface is dark-mode-first with translucent glass panels, soft borders, a calm blue/gray palette and restrained motion. It favors interpretation over noise.

## Principles

- **Deterministic first.** Signals come from price, volume, indicators, candle structure and support/resistance, not from model guesses.
- **Explainable.** Every score is backed by `details`.
- **Honest.** Outputs are analytical summaries, not predictions or financial advice.

```text
Signals are analytical summaries based on available market data. They are not financial advice and do not guarantee future performance.
```
