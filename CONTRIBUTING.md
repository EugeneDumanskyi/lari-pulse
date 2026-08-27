# Contributing to LariPulse

Thanks for your interest. LariPulse is a small, local-first codebase. These rules keep it that way.

## Core principle

Every widget is an explainable analytical engine with structured JSON output, not a static dashboard tile.

## Getting started

```bash
npm install
npm run db:init
npm run dev
```

Before opening a pull request, run:

```bash
npm run lint
npm run typecheck
npm run test:db
npm run test:auth
npm run test:indicators
npm run test:correlations
npm run test:collectors
npm run test:widgets
npm run test:services
npm run test:scheduler
```

CI runs the same checks plus `npm run build`. If you change UI flows, also run `npm run test:e2e`.

Services decide access with `requireRole` from `src/lib/auth/access.ts`; don't gate features only in React.

Keep pull requests focused. One feature or fix per PR is easiest to review.

## Layer rules

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

Do not mix these layers.

- **Collectors** fetch, validate, normalize, store and log. They never calculate signals, decide bullish or bearish states, or produce summaries.
- **Indicators** are pure functions with no database or network access.
- **Widgets** receive a `WidgetContext` and return a `WidgetResult`. They never touch the database, the network or the UI.
- **Route handlers** validate input and call services. No widget logic in routes.
- **Components** render API results. No signal logic in React.

## Widget contract

Every widget returns:

```text
score        0-100
direction    enum-like string
confidence   0-1
severity     low | medium | high
summary      short, human-readable, grounded in details
details      structured diagnostic data
sources      source references
updatedAt    ISO timestamp
```

The dashboard renders any widget generically from this shape. The runner rejects results that do not match it.

## Signal rules

- **Deterministic first.** Signals come from OHLCV data, indicators, candle structure, volume, support/resistance and timeframe agreement.
- **Combine inputs.** A widget should not be a wrapper around a single indicator.
- **Lower confidence** when inputs conflict, data is stale or history is insufficient.
- **Explain.** Every score must be traceable through `details`.
- **Don't overpromise.** Outputs are analytical context, never guaranteed predictions or trade instructions.

Bad:

```json
{ "score": 72, "summary": "Bullish signal detected." }
```

Good:

```json
{
  "score": 72,
  "direction": "bullish",
  "confidence": 0.68,
  "summary": "Trend remains bullish because price is above MA7 and MA30, while recent candles show higher lows.",
  "details": {
    "priceVsMA7": "above",
    "priceVsMA30": "above",
    "ma7VsMA30": "above",
    "structure": "higher_lows",
    "volumeTrend": "stable"
  }
}
```

## Infrastructure

LariPulse runs as one Next.js process with one SQLite file. Please don't add Redis, PostgreSQL, message queues, Docker requirements or separate services without discussing it in an issue first.

## Reliability and security

- Never hardcode secrets. Use environment variables and document them in `.env.example`.
- Never assume external API responses are valid.
- Validate every query parameter and request body.
- Use parameterized SQL only.
- Log failures in `source_runs` and surface them gently in the UI. Errors must not crash the app.
- Respect data source terms and rate limits.

## Tests

Add or update tests for indicator math, widget output, collectors (normalization and error handling) and repository behavior when you change them. Tests run with `tsx --test` and need no network access.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
