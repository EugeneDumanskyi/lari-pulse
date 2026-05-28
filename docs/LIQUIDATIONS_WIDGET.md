# Liquidations Widget

## Data Source

The Liquidations widget uses the Binance USD-M Futures all-market liquidation stream:

```text
wss://fstream.binance.com/ws/!forceOrder@arr
```

This stream is live-only. Binance does not provide a working historical backfill endpoint for these missed stream events, so LariPulse cannot reconstruct liquidation history from before the local collector was running.

## Local History Model

The Binance WebSocket collector stays running as an ingestion path only. Every valid received event is normalized and stored in the local SQLite `liquidation_events` table.

Stored normalized fields:

```text
id
exchange/source: binance_futures
symbol
side: long_liquidated or short_liquidated
price
quantity
notionalUsd
timestamp/eventTime
source metadata
```

The SQLite column `liquidation_side` stores compact internal values `long` and `short` for backward compatibility with existing local DB files. Repository records and widget details expose product-facing side values as `long_liquidated` and `short_liquidated`.

Deduplication is based on a deterministic `event_id`, so duplicate WebSocket messages or reconnect repeats are ignored.

## Timeframe Behavior

The widget reads stored local events for the selected dashboard timeframe:

```text
1h
4h
1d
7d
30d
90d
```

For each selected interval it aggregates:

```text
totalLiquidatedUsd
longLiquidatedUsd
shortLiquidatedUsd
longShortImbalance
eventCount
largestLiquidation
topSymbolsByLiquidation
bucketed timeline data
```

The `90d` view only becomes meaningful after the local collector has been running long enough. A fresh local database will show a collecting state rather than pretending history is complete.

## UI States

The widget distinguishes:

```text
collecting_from_now
stored events available
collector_disconnected
collector_error
storage_error
```

An empty selected interval means no matching events are stored locally for that interval. It does not mean Binance had no liquidations globally before the collector started.

## Manual Verification

Run the app with liquidity runtime enabled:

```bash
LIQUIDITY_RUNTIME_ENABLED=true npm run dev
```

Check runtime state:

```bash
curl -sS http://localhost:3000/api/runtime/status
```

Expected stream state:

```text
liquidity.liquidationStream.started = true
liquidity.liquidationStream.connected = true
```

Check stored events:

```bash
sqlite3 data/laripulse.sqlite "select count(*) from liquidation_events;"
```

Open the dashboard as admin and switch the toolbar timeframe between `1h`, `4h`, `1d`, `7d`, `30d`, and `90d`. The Liquidations card should update from stored local events for that selected timeframe.

## Test Commands

```bash
npm run test:collectors
npm run test:db
npm run test:services
npm run test:widgets
npm run typecheck
```
