# Chart Overlays

Chart Overlays are the reason layer on top of the dashboard price chart.

They answer:

```text
Which chart levels matter right now, and which signal produced them?
```

They do not replace widget details and do not produce trade instructions.

## Dashboard

```text
/dashboard
```

The dashboard chart renders overlays when the current user can see the source widget. Clicking an overlay opens a compact reason popover with the source widget id, the level, and the human-readable reason. The popover can open the related widget card when that source widget is visible in the current widget grid.

Supported overlay kinds:

- `price_line`
- `price_zone`
- `event_marker`

## API

```text
GET /api/market/overlays?symbol=BTCUSDT&timeframe=1h
```

Response items include:

```text
id
kind
symbol
timeframe
price
priceRange
timestamp
label
severity
sourceWidget
reason
```

## Service

Overlay extraction lives in:

```text
src/lib/services/chartOverlayService.ts
```

The service reads frontend-safe widget result details through the widget result service, applies current local access/widget visibility, and returns compact overlay records for the chart. React components only render these records; they do not parse widget details.

Current extraction sources:

- `support_resistance_pressure`: nearest support and resistance zones.
- `liquidations`: largest observed liquidation event in the selected local window.
- persisted Situation Overview watch conditions when a condition includes a parseable price.

## Guardrails

- Keep overlay extraction in the service layer.
- Do not expose raw collector payloads in overlay responses.
- Do not fetch external data from the chart component.
- Do not show overlays from widgets hidden by the instance widget settings.
- Keep overlays descriptive; they are signal context, not entries, exits, or price targets.
