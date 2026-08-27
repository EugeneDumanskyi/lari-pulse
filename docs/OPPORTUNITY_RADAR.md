# Opportunity Radar

Opportunity Radar is the ranking layer over deterministic Situation Overview state.

It answers:

```text
Which accessible market states deserve attention right now, and why?
```

It does not produce trade instructions, position sizing, or predictions.

## Page

```text
/radar
```

The page supports:

- symbol scope controls
- timeframe scope controls
- bias, risk, and confidence filters
- ranked setup rows
- top reason, top drivers, blockers, and watch conditions

Any signed-in user (or anonymous visitor when the public dashboard is on) can scan BTC, ETH, and SOL across the configured collection timeframes.

## API

```text
GET /api/radar/opportunities?symbols=BTCUSDT,ETHUSDT,SOLUSDT&timeframes=15m,1h,4h,1d&limit=20
```

Response items include:

```text
symbol
timeframe
rank
setupScore
attentionScore
bias
riskLevel
confidence
primaryReason
topDrivers
blockingRisks
watchConditions
updatedAt
```

## Service

Radar logic lives in:

```text
src/lib/services/opportunityRadarService.ts
```

The service builds current Situation Overviews for each accessible symbol/timeframe and ranks them. It disables alert evaluation while scanning so opening Radar does not create alert events for every scanned market.

Situation Overview persistence still applies. A radar scan can create `situation_overviews` rows if the overview materially changes or the snapshot interval has elapsed.

## Scoring

`setupScore` favors:

- directional bias and absolute score strength
- high confidence
- fresh changed-since-previous state
- high-strength drivers
- useful watch conditions

`setupScore` penalizes:

- elevated/high/extreme risk
- conflicting signals
- stale inputs
- missing inputs
- non-info data warnings

`attentionScore` is separate from setup quality. It highlights markets that may deserve review because risk, changes, conflicts, or watch conditions are active, even if the setup score is not high.

## Guardrails

- Do not put radar scoring in React components or API route handlers.
- Do not bypass local symbol access controls.
- Do not make Radar a trade recommendation engine.
- Do not trigger alert events from radar scans.
- Do not add external data sources, queues or Redis.
