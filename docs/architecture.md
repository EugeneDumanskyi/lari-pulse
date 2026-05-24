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

> Is something important changing for BTC, SOL, oil, gold, Nasdaq or the dollar right now?

> Is the current environment risk-on, risk-off or mixed?

> Is a bullish move confirmed by volume and multi-timeframe structure, or is it becoming overheated?

> Is price approaching, rejecting, breaking or losing an important level?

## Scope

The core is a crypto signal system:

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

It should be easy to run locally, easy to debug and easy to extend. Cross-market intelligence (oil, gold, Nasdaq, S&P 500, dollar, rates, VIX) sits on the same pipeline and the same widget contract.

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

### Data Sources

```text
Binance Spot API (public klines, no key required)
FRED CSV series (daily, no key required)
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
Sources:    Binance API, FRED
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
display_name, provider_symbol, price_unit, metadata_json,
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

### widget_settings

```text
id, widget_id (unique), is_enabled, updated_at
```

Stores which widgets the instance shows. Widgets missing from the table fall back to the catalog default.

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
  marketContext?: WidgetMarketContext;
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

## Cross-Market Intelligence

### Assets

| Symbol | FRED series | Note |
| --- | --- | --- |
| `XAUUSD` | `NASDAQQGLDI` | Gold price index proxy, not spot XAU/USD |
| `WTI` | `DCOILWTICO` | WTI crude oil |
| `NASDAQ100` | `NASDAQ100` | Nasdaq 100 |
| `SPX` | `SP500` | S&P 500 |
| `DXY` | `DTWEXBGS` | Broad dollar index proxy, not ICE DXY |
| `US10Y` | `DGS10` | 10-year Treasury yield |
| `VIX` | `VIXCLS` | CBOE volatility index |

Normalized LariPulse symbols are kept separate from provider tickers through `symbols.provider_symbol`. FRED observations are stored as daily candles in the shared `candles` table.

### Flow

```text
Binance + FRED
  ↓
Collectors
  ↓
SQLite candles
  ↓
Correlation engine (src/lib/correlations, correlationService)
  ↓
WidgetMarketContext (src/lib/widgets/marketContext.ts)
  ↓
Cross-market widget engines
  ↓
GET /api/widgets/cross-market?timeframe=1d
```

### Market Context

```ts
export interface WidgetMarketContext {
  timeframeCandles?: Record<string, Candle[]>;
  assetCandles?: Record<string, Record<string, Candle[]>>;
  correlations?: CorrelationPairResult[];
  regimeHints?: MarketRegimeHint[];
  latestCandleUpdatedAt?: string;
  metadata?: Record<string, unknown>;
}
```

Every multi-asset widget reads this one typed shape. Engines never build their own cross-market context.

### Correlations

```text
close-to-close percentage returns
date-aligned rolling Pearson correlation
short-term compounded-return divergence
volatility-adjusted latest movement
```

Configured pairs: BTC/Nasdaq 100, BTC/DXY, ETH/Nasdaq 100, SOL/Nasdaq 100, Gold/DXY, Gold/US10Y, Oil/US10Y and Nasdaq 100/US10Y. Correlation is descriptive and never implies causation.

### Widgets

```text
macro_risk_pulse           broad risk-on/risk-off read across crypto, equities, dollar, yields, gold and oil
dollar_pressure            whether dollar strength or weakness is pressuring crypto, equities or gold
gold_risk_hedge            whether gold acts as a hedge, an inflation hedge or a weak defensive asset
oil_inflation_pressure     whether oil is adding inflation pressure or market stress
nasdaq_crypto_correlation  whether BTC, ETH and SOL move with Nasdaq or diverge
cross_market_divergence    related markets that stop confirming each other
risk_regime                summary regime classification
```

Shared trend helpers live next to the engines. Correlation math stays in the correlation layer and services, never in routes or components.

### Scheduling

Cross-market refresh is optional (`PHASE2_SCHEDULER_ENABLED`) and runs on its own interval (`PHASE2_REFRESH_INTERVAL_SECONDS`, daily by default). The due check reads the latest successful FRED run, so restarts do not cause duplicate collection. A refresh collects FRED data, recalculates correlations, runs the cross-market widgets and stores `CROSS_MARKET` widget results.

## Access and Visibility

A local access model limits what anonymous visitors see: BTC and the core widgets. The local admin unlocks all markets and widgets. Widget metadata and priority come from `src/lib/widgets/catalog.ts`; visibility is stored in `widget_settings`. Services apply visibility before returning results, so the decision never lives only in React.

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
GET  /api/widgets/cross-market?timeframe=1d
GET  /api/markets
GET  /api/markets/overview?symbol=BTCUSDT
GET  /api/settings/widgets
PUT  /api/settings/widgets
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/session
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
Cross-market section
```

The sidebar also opens Markets (a read-only directory of every configured series with freshness, source notes and a compact chart) and Settings.

Each widget card shows title, score, direction, confidence, severity, short summary, updated time and a details button. The details view shows the full summary, indicator values, source references, timestamps and any conflicts or warnings. Stale or missing data is always visible.

The interface is dark-mode-first with translucent glass panels, soft borders, a calm blue/gray palette and restrained motion. It favors interpretation over noise.

## Principles

- **Deterministic first.** Signals come from price, volume, indicators, candle structure, support/resistance and correlations, not from model guesses.
- **Explainable.** Every score is backed by `details`.
- **Honest.** Outputs are analytical summaries, not predictions or financial advice.

```text
Signals are analytical summaries based on available market data. They are not financial advice and do not guarantee future performance.
```
