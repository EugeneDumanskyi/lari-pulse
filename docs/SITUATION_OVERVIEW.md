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
  + admin cross-market widgets when visible
  -> situation overview service
  -> deterministic rules/scoring
  -> GET /api/overview/situation
  -> dashboard Situation Overview card
```

The service reuses existing widget result contracts. It does not fetch external market data directly.

## Input Widgets

Primary directional inputs:

- `trend_strength`
- `momentum_exhaustion`
- `volume_confirmation`
- `multi_timeframe_alignment`

Secondary/risk inputs:

- `support_resistance_pressure`
- `liquidations`

Admin cross-market context:

- `risk_regime`
- `macro_risk_pulse`
- `dollar_pressure`
- `nasdaq_crypto_correlation`
- `cross_market_divergence`
- `gold_risk_hedge`
- `oil_inflation_pressure`

The expected input list follows effective widget visibility. Locked or disabled widgets are not treated as required.

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
- collapsible source widget status

The card preserves the existing dark glass dashboard style and keeps the financial-advice disclaimer subtle.

## Previous-State Comparison

The service uses an in-memory per-session-plan/symbol/timeframe cache for previous overview comparison.

Compared fields:

- bias
- risk level
- directional score
- confidence
- top driver

This is intentionally minimal. A later version can persist overviews in SQLite if historical situation timelines become product-critical.

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

## Limitations

- The overview is only as current as the stored widget results.
- Liquidation event history is locally observed only while runtime is connected.
- Cross-market inputs use daily proxy data and are admin-visible only in the local access model.
- The previous-state cache resets when the Next.js process restarts.
- The summary is deterministic and rule-based.

