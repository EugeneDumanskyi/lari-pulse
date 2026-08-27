# Local Alerts

## Purpose

Local Alerts turn Situation Overview changes into explainable in-app events. They are designed for personal monitoring without external notification providers or queues.

Alerts are not trading instructions. They describe state changes such as risk rising, bias changing, or a new watch condition appearing.

## Architecture

Implementation files:

- `src/lib/db/repositories/alertRepository.ts`
- `src/lib/services/alertService.ts`
- `src/app/api/alerts/rules/route.ts`
- `src/app/api/alerts/rules/[id]/route.ts`
- `src/app/api/alerts/events/route.ts`
- `src/app/api/alerts/events/[id]/ack/route.ts`
- `src/app/api/alerts/evaluate/route.ts`
- `src/components/alerts/AlertsFoundation.tsx`
- `src/app/alerts/page.tsx`

Flow:

```text
Situation Overview build
  + previous persisted overview
  + enabled alert_rules for symbol/timeframe (all users)
  -> deterministic alert evaluation
  -> deduped alert_events
  -> /alerts page and /api/alerts/events
```

## Storage

SQLite tables:

- `alert_rules`
- `alert_events`

Rules belong to the user who created them and are scoped by `symbol` and `timeframe`. Each event belongs to its rule's owner. Alerts require the `analyst` role; users only ever see their own rules and events.

Events store:

- rule id
- symbol and timeframe
- severity
- title, message, explanation
- source widget when available
- optional overview id
- structured metadata
- acknowledgement timestamp

Open events dedupe by:

```text
rule_id + symbol + timeframe + trigger_key
```

After an event is acknowledged, the same material trigger can create a new event again.

## Supported Rule Types

- `situation_bias_changed`: fires when the overview bias changes.
- `risk_level_changed`: fires when overview risk changes.
- `watch_condition_appeared`: fires when a watch condition is present now but was not present in the previous overview.
- `widget_direction_changed`: fires when the top overview driver changes.
- `score_crossed_threshold`: fires when the directional score crosses above or below a configured threshold.

## APIs

```text
GET /api/alerts/rules
POST /api/alerts/rules
PUT /api/alerts/rules/:id
DELETE /api/alerts/rules/:id
GET /api/alerts/events
POST /api/alerts/events/:id/ack
POST /api/alerts/evaluate
```

Example rule:

```bash
curl -X POST http://localhost:3000/api/alerts/rules \
  -H "content-type: application/json" \
  -d '{"ruleType":"risk_level_changed","symbol":"BTCUSDT","timeframe":"1h","severity":"warning"}'
```

Manual evaluation:

```bash
curl -X POST http://localhost:3000/api/alerts/evaluate \
  -H "content-type: application/json" \
  -d '{"symbol":"BTCUSDT","timeframe":"1h"}'
```

The normal `GET /api/overview/situation` path also evaluates enabled rules for the requested symbol/timeframe.

## UI

The Alerts page is available at:

```text
/alerts
```

It shows:

- open events
- acknowledgement controls
- active rules
- local rule creation
- manual evaluation for the selected symbol/timeframe
- recently acknowledged events

The page uses the existing dark glass shell. Analysts and admins can create rules for any configured market; viewers don't see the page.

## Limitations

- Alerts are local SQLite records only.
- There are no email, push, webhook, or mobile notifications.
- Evaluation happens when Situation Overview is requested or when manual evaluation is triggered.
- No separate background alert worker exists.
- Rules depend on the quality and freshness of stored widget results.
