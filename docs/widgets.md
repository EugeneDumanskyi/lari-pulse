# LariPulse Widget Inventory

This document lists the widget engines currently implemented in LariPulse.

Widgets do not fetch external data directly. Collectors fetch and normalize market data into SQLite first, then widget engines read normalized candles, correlation context, and liquidity context through services. The frontend consumes structured widget results through API endpoints.

## Runtime Notes

The default project workflow is:

```bash
npm run dev
```

The scheduler is not a separate process. It is an in-process scheduler started by Next.js instrumentation when the app starts.

Relevant local environment flags:

```env
SCHEDULER_ENABLED=true
COLLECT_INTERVAL_SECONDS=60
PHASE2_SCHEDULER_ENABLED=false
PHASE2_REFRESH_INTERVAL_SECONDS=86400
LIQUIDITY_RUNTIME_ENABLED=false
LIQUIDATIONS_RETENTION_HOURS=2160
```

Manual collection commands and endpoints:

```bash
curl -X POST http://localhost:3000/api/collect/run
npm run collect:fred
```

When `LIQUIDITY_RUNTIME_ENABLED=true`, the app process also starts the Binance liquidation stream and prunes old liquidation events.

Main widget result endpoints:

```text
GET /api/widgets/latest?symbol=SOLUSDT
GET /api/widgets/latest?symbol=SOLUSDT&timeframe=1h
GET /api/widgets/history?symbol=SOLUSDT&widgetId=trend_strength
GET /api/widgets/cross-market?timeframe=1d
```

## Crypto Widgets

---

### Trend Strength

purpose: Evaluates whether the selected crypto asset is trending bullish, bearish, or sideways using price position, moving-average alignment, and candle structure.

source: Binance Spot Kline API, collected through `POST /api/collect/run`; widget results exposed through `GET /api/widgets/latest` and `GET /api/widgets/history`.

method: API collection into SQLite, deterministic indicator/widget calculation.

notes: Implemented as `trend_strength`. Uses normalized OHLCV candles for configured symbols and timeframes.

---

### Momentum Exhaustion

purpose: Detects whether recent momentum may be stretched or losing quality using RSI, moving-average distance, candle range, wick behavior, and volume pressure.

source: Binance Spot Kline API, collected through `POST /api/collect/run`; widget results exposed through `GET /api/widgets/latest` and `GET /api/widgets/history`.

method: API collection into SQLite, deterministic indicator/widget calculation.

notes: Implemented as `momentum_exhaustion`. This is a risk/condition signal, not a prediction that price must reverse.

---

### Support / Resistance Pressure

purpose: Estimates nearby swing support/resistance zones and explains whether price is pressuring support, resistance, or trading between zones.

source: Binance Spot Kline API, collected through `POST /api/collect/run`; widget results exposed through `GET /api/widgets/latest` and `GET /api/widgets/history`.

method: API collection into SQLite, deterministic support/resistance and candle-position analysis.

notes: Implemented as `support_resistance_pressure`. Uses normalized candles only; no order book or liquidation data is used.

---

### Volume Confirmation

purpose: Checks whether recent volume confirms or weakens the current candle direction and range behavior.

source: Binance Spot Kline API, collected through `POST /api/collect/run`; widget results exposed through `GET /api/widgets/latest` and `GET /api/widgets/history`.

method: API collection into SQLite, deterministic volume trend and candle analysis.

notes: Implemented as `volume_confirmation`. Uses Binance candle volume from normalized OHLCV rows.

---

### Multi-Timeframe Alignment

purpose: Compares trend and RSI state across configured crypto timeframes to show whether the market is aligned or conflicted.

source: Binance Spot Kline API, collected through `POST /api/collect/run`; widget results exposed through `GET /api/widgets/latest` and `GET /api/widgets/history`.

method: API collection into SQLite, deterministic multi-timeframe analysis.

notes: Implemented as `multi_timeframe_alignment`. Uses the shared widget market context rather than fetching data inside the widget.

---

### Liquidations

purpose: Summarizes observed long and short forced-order liquidations for the selected dashboard interval.

source: Binance USD-M Futures `!forceOrder@arr` WebSocket stream, normalized into `liquidation_events`.

method: WebSocket API collection into SQLite, interval aggregation by service, deterministic widget calculation from normalized liquidity context.

notes: Implemented as `liquidations`. `SELL` forced order means long liquidation; `BUY` forced order means short liquidation. Binance's stream is live-only, so the widget reads stored local events and history starts when the local collector is running. The `90d` view only becomes meaningful after enough local collection time.

---

## Cross-Market Widgets

---

### Macro Risk Pulse

purpose: Combines crypto, equity, dollar, yield, gold, and oil trends into a broad risk-on/risk-off interpretation.

source: Binance Spot Kline API for BTC/ETH/SOL and FRED CSV observations for XAUUSD proxy, WTI, NASDAQ100, SPX, DXY proxy, US10Y, and VIX; results exposed through `GET /api/widgets/cross-market?timeframe=1d`.

method: API collection into SQLite, deterministic cross-market widget calculation, correlation context from stored candles.

notes: Implemented as `macro_risk_pulse`. XAUUSD and DXY are documented FRED proxies, not spot XAU/USD or ICE DXY.

---

### Dollar Pressure

purpose: Evaluates whether dollar strength or weakness is pressuring crypto, equities, or gold.

source: Binance Spot Kline API for crypto and FRED CSV observations for DXY proxy, NASDAQ100, SPX, and XAUUSD proxy; results exposed through `GET /api/widgets/cross-market?timeframe=1d`.

method: API collection into SQLite, deterministic trend comparison.

notes: Implemented as `dollar_pressure`. Uses a broad U.S. dollar index proxy from FRED.

---

### Gold / Risk Hedge Signal

purpose: Determines whether gold is behaving like a hedge, inflation hedge, or weak defensive asset relative to broader risk markets.

source: FRED CSV observations for XAUUSD proxy, DXY proxy, US10Y, and WTI, plus cross-market context; results exposed through `GET /api/widgets/cross-market?timeframe=1d`.

method: API collection into SQLite, deterministic trend and relationship analysis.

notes: Implemented as `gold_risk_hedge`. Gold data is a FRED/Nasdaq daily index proxy, not direct spot XAU/USD.

---

### Oil Inflation Pressure

purpose: Detects whether oil movement is adding inflation pressure or market stress.

source: FRED CSV observations for WTI, US10Y, SPX/NASDAQ100, and related cross-market assets; results exposed through `GET /api/widgets/cross-market?timeframe=1d`.

method: API collection into SQLite, deterministic trend and pressure analysis.

notes: Implemented as `oil_inflation_pressure`. FRED WTI observations are daily only.

---

### Nasdaq-Crypto Correlation

purpose: Shows whether BTC, ETH, and SOL are moving with Nasdaq or diverging from it.

source: Binance Spot Kline API for crypto and FRED CSV observations for NASDAQ100; results exposed through `GET /api/widgets/cross-market?timeframe=1d`.

method: API collection into SQLite, date-aligned return calculation and rolling Pearson correlation.

notes: Implemented as `nasdaq_crypto_correlation`. Correlation is descriptive and does not imply causation.

---

### Cross-Market Divergence

purpose: Identifies unusual situations where related markets stop confirming each other.

source: Binance Spot Kline API for crypto and FRED CSV observations for cross-market assets; results exposed through `GET /api/widgets/cross-market?timeframe=1d`.

method: API collection into SQLite, deterministic divergence analysis using correlation pair results.

notes: Implemented as `cross_market_divergence`. Uses configured correlation pairs such as BTC/Nasdaq, BTC/DXY, Gold/DXY, and Nasdaq/US10Y.

---

### Risk-On / Risk-Off Regime

purpose: Summarizes the broad cross-market environment into a risk regime state.

source: Binance Spot Kline API for crypto and FRED CSV observations for macro/cross-market assets; results exposed through `GET /api/widgets/cross-market?timeframe=1d`.

method: API collection into SQLite, deterministic cross-asset scoring.

notes: Implemented as `risk_regime`. This is an explainable regime classification, not a black-box prediction.

---

## External Data Sources

### Binance

purpose: Crypto OHLCV candles for BTCUSDT, ETHUSDT, and SOLUSDT.

source: Binance Spot Kline API and Binance USD-M Futures liquidation WebSocket stream.

method: API.

notes: Spot klines are used by crypto widgets and the crypto side of cross-market widgets. The futures liquidation stream is used by the Liquidations widget as observed runtime data.

### FRED

purpose: Daily macro and cross-market observations.

source: FRED CSV endpoints.

method: API/CSV parsing.

notes: Current mappings are `XAUUSD -> NASDAQQGLDI`, `WTI -> DCOILWTICO`, `NASDAQ100 -> NASDAQ100`, `SPX -> SP500`, `DXY -> DTWEXBGS`, `US10Y -> DGS10`, and `VIX -> VIXCLS`.

