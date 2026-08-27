# Situation Overview

## Purpose

The Situation Overview is the deterministic summary layer for the dashboard. It turns existing widget outputs into a concise market-state read:

- current bias
- risk level
- confidence
- main drivers
- conflicting signals
- watch conditions
- data warnings
- changes since the previous calculation

It is market-state analysis only. It does not produce buy, sell, long, short, entry, stop, or take-profit instructions.

## Architecture

Implementation files:

- `src/lib/services/situationOverview/situationOverview.types.ts`
- `src/lib/services/situationOverview/situationOverview.rules.ts`
- `src/lib/services/situationOverview/situationOverview.service.ts`
- `src/app/api/overview/situation/route.ts`
- `src/components/dashboard/useSituationOverview.ts`
- `src/components/dashboard/SituationOverviewCard.tsx`

Flow:

```text
latest widget_results + derived liquidity result
  + stored market overview metrics
  + cross-market widgets when visible
  + latest persisted situation_overviews row
  -> situation overview service
  -> deterministic rules/scoring
  -> persist material overview snapshots
  -> evaluate matching local alert rules
  -> GET /api/overview/situation
  -> dashboard Situation Overview card
```

The service reuses existing widget result contracts. It does not fetch external market data directly. Situation snapshots are stored in SQLite so previous-state comparison and compact timeline review survive page reloads and server restarts.

## Input Widgets

Primary directional inputs:

- `trend_strength`
- `momentum_exhaustion`
- `volume_confirmation`
- `multi_timeframe_alignment`

Secondary/risk inputs:

- `support_resistance_pressure`
- `liquidations`

Cross-market context:

- `risk_regime`
- `macro_risk_pulse`
- `dollar_pressure`
- `nasdaq_crypto_correlation`
- `cross_market_divergence`
- `gold_risk_hedge`
- `oil_inflation_pressure`

The expected input list follows effective widget visibility. Disabled widgets are not treated as required.

## Rules And Scoring

Directional score is normalized from `-100` to `+100`.

- Trend, momentum, volume, and multi-timeframe alignment are weighted most heavily.
- Support/resistance contributes a smaller directional modifier.
- Cross-market widgets contribute context when admin-visible.
- Liquidation widgets mostly affect risk and conflict detection rather than pure direction.

Risk score is normalized from `0` to `100`.

Risk increases when:

- widget severity is medium/high
- signals conflict
- confidence is low
- expected inputs are missing
- source widgets are stale
- liquidation pressure is one-sided
- support/resistance is near or in breakout/breakdown watch state
- macro context is risk-off or mixed

Confidence is `low`, `medium`, or `high` based on average widget confidence, signal coverage, conflicts, stale inputs, and missing primary inputs.

## API Contract

```text
GET /api/overview/situation?symbol=BTCUSDT&timeframe=1h
```

The route validates symbol/timeframe and access level, then returns:

```ts
SituationOverview
```

Main fields:

- `title`
- `summary`
- `bias`
- `riskLevel`
- `confidence`
- `score`
- `riskScore`
- `mainDrivers`
- `conflictingSignals`
- `watchConditions`
- `dataWarnings`
- `changedSincePrevious`
- `history`
- `sourceWidgets`
- `meta`

Missing or stale data produces a partial overview instead of a hard failure where possible.

## Frontend Integration

The dashboard uses `useSituationOverview({ symbol, timeframe, refreshKey })` and renders `SituationOverviewCard` above market metrics, chart, and widget cards.

UI states:

- loading skeleton
- error state
- partial-data badge
- main drivers and conflicts
- watch conditions
- data warnings
- changed-since-previous block
- persisted situation timeline
- collapsible source widget status

The card preserves the existing dark glass dashboard style and keeps the financial-advice disclaimer subtle.

## Previous-State Comparison

Previous-state comparison reads the latest persisted `situation_overviews` row for the symbol and timeframe.

Compared fields:

- bias
- risk level
- directional score
- confidence
- top driver

The service persists a new snapshot when the overview materially changes or when there is no snapshot for that symbol/timeframe in the last 15 minutes. The compact history API is:

```text
GET /api/overview/situation/history?symbol=BTCUSDT&timeframe=1h&limit=50
```

The history response is designed for timeline UI, not full replay. It includes timestamp, title, bias, risk, confidence, score, risk score, top driver, and change labels.

## Alert Integration

The overview service evaluates enabled local alert rules after each Situation Overview build. Rules from every user are checked for the symbol and timeframe, and each event goes to the rule's owner. They can create in-app events for:

- bias changes
- risk-level changes
- new watch conditions
- main driver changes
- directional score threshold crossings

Alert events are persisted in `alert_events`, deduped while open, and acknowledged through the Alerts page or `POST /api/alerts/events/:id/ack`. There are no external notifications, push services, or background queues.

## Tests

Focused deterministic fixtures live in:

```text
src/lib/services/situationOverview/situationOverview.rules.test.ts
```

Run:

```bash
npm run test:services
```

Fixtures cover:

- bullish aligned setup
- bearish aligned setup
- mixed/conflicting setup
- missing data / partial overview
- observed liquidation history
- previous-vs-current change detection
- situation overview repository persistence and timeline ordering
- alert service event creation and dedupe behavior

## Limitations

- The overview is only as current as the stored widget results.
- Liquidation event history is locally observed only while runtime is connected.
- Cross-market inputs use daily proxy data and are admin-visible only in the local access model.
- Persisted history is local to the SQLite file and shared across the instance.
- The summary is deterministic and rule-based.

