# Scans

Scans runs an explicit, user-stated filter across the configured symbols
and timeframes and returns the pairs whose stored deterministic state
matches, naming the conditions that matched and the ones that did not.
Every condition comes from a closed vocabulary over fields the Situation
Overview already computes, so a scan reads state rather than deriving a
new one.

It is not a strategy backtester, not a signal generator, not a ranking,
and not a source of trade entries, exits, price targets or sizing. The
boundary against [Opportunity Radar](OPPORTUNITY_RADAR.md) is the point
of the feature: Radar answers "what deserves attention right now", and
Scans answers "which markets match the conditions I named".

This document specifies the feature before it is built. The condition
vocabulary, the route, the payload shapes, the function signatures, the
UI states and the test names below are the contract, and a change to any
of them is a change to this file first.

## Scope

Implemented:

- Nothing yet.

Not implemented:

- `src/lib/services/scanService.ts`.
- `GET /api/scans/run` (`src/app/api/scans/run/route.ts`).
- `validateJsonQueryParam` in `src/lib/services/apiValidation.ts`.
- `/scans` page and the enabled sidebar item.
- `src/components/scans/ScansFoundation.tsx`.

Out of scope:

- Historical replay, backtesting or performance statistics.
- Ranking or scoring of the matches beyond what the stored state says.
- New collectors, widgets or external data sources.
- Saved scan definitions. The `scan_definitions` sketch under
  [Storage](#storage) stays a later, separate addition.
- Near-miss reporting — "matched three of four conditions" is not a
  result, because a partial match is a non-match, and reporting it by
  pair would be a ranking under another name. The per-condition counts
  in `summary.conditionSummary` are what explains an empty result set.

## Filter Vocabulary

A filter is a flat array of typed condition objects plus one top-level
`match`. There is no nesting, no expression language, no tokenizer and
no parser to maintain: validation is an exhaustive switch over a known
`type`, and every condition carries a fixed human label so the matched
and unmatched lists read as sentences rather than echoed JSON.

```jsonc
{
  "match": "all",
  "conditions": [
    { "type": "bias", "in": ["bullish", "strong_bullish"] },
    { "type": "risk_level", "in": ["low", "moderate"] },
    { "type": "conflicts", "state": "none" }
  ]
}
```

Every field read below is already declared on `SituationOverview` in
`src/lib/services/situationOverview/situationOverview.types.ts`. No
condition reaches a widget result, a candle or the database directly.

| `type` | Shape | Matches when |
| --- | --- | --- |
| `bias` | `{ in: SituationBias[] }` | `overview.bias` is in the set |
| `risk_level` | `{ in: SituationRiskLevel[] }` | `overview.riskLevel` is in the set |
| `confidence` | `{ in: SituationConfidence[] }` | `overview.confidence` is in the set |
| `score` | `{ operator: "above" \| "below", value: number }` | `overview.score` is strictly above / below `value` |
| `risk_score` | `{ operator: "above" \| "below", value: number }` | `overview.riskScore` is strictly above / below `value` |
| `main_driver` | `{ widgetIds: string[], position?: "top" \| "any" }` | a `mainDrivers` entry's `sourceWidget` is in the set |
| `driver_direction` | `{ widgetId: string, in: SituationDriverDirection[] }` | that widget's driver has one of those directions |
| `watch_condition` | `{ state: "present" \| "absent", ids?: string[], minimumSeverity?: "info" \| "warning" \| "critical" }` | the filtered `watchConditions` list is non-empty / empty |
| `conflicts` | `{ state: "none" \| "any" }` or `{ operator: "above" \| "below", value: number }` | against `conflictingSignals.length` |
| `freshness` | `{ state: "fresh" \| "any" }` | `fresh` requires `meta.isPartial === false` and an empty `meta.staleInputs` |
| `changed` | `{ ids: SituationChangeId[] }` | `changedSincePrevious` carries one of those ids |

### Two things the field names alone get wrong

`overview.score` is **−100..100**, not 0..100. It is the weighted
directional score clamped to that range in
`situationOverview.rules.ts:670`; negative is bearish, positive is
bullish, zero is the no-weighted-signal case. `overview.riskScore` is a
separate 0..100 magnitude (`situationOverview.rules.ts:675-685`). So the
`score` condition validates `-100..100` and its UI control is a signed
range, while `risk_score` validates `0..100` with an unsigned one.
Anyone who copies the `risk_score` bounds onto `score` silently makes
half the scale unreachable.

The `bias`, `risk_level` and `confidence` value sets are the union types
in full, **including `unknown`** for bias and risk level. A scan for the
pairs whose state could not be determined is legitimate and is often the
most useful thing to run after a collection gap, so `unknown` is a first
class value in the vocabulary and in the UI control, not a filtered-out
sentinel.

### Value sets

```text
SituationBias             strong_bullish bullish neutral bearish
                          strong_bearish mixed unknown
SituationRiskLevel        low moderate elevated high extreme unknown
SituationConfidence       low medium high
SituationDriverDirection  bullish bearish neutral mixed risk_on
                          risk_off unknown
SituationChangeId         bias-change risk-change score-change
                          confidence-change driver-change
```

`SituationChangeId` is a new union in `scanService.ts` naming the five
ids `changedSincePrevious` can carry
(`situationOverview.rules.ts:600-648`). All five are in the vocabulary:
omitting `score-change` and `confidence-change` would leave two emitted
ids unreachable, and a closed vocabulary that cannot express a value the
data actually holds is a gap, not a simplification.

### Per-condition semantics and labels

Each condition produces one fixed label, built from its own parameters
and nothing else, so the same condition always reads the same way
regardless of the pair it ran against. `actual` is the value found on
that pair, rendered as a short string by the service.

```text
bias              label   Bias is bullish or strong bullish
                  actual  bearish
risk_level        label   Risk level is low or moderate
                  actual  elevated
confidence        label   Confidence is high
                  actual  medium
score             label   Directional score is above 40
                  actual  score 18
risk_score        label   Risk score is below 50
                  actual  risk score 63
main_driver       label   Trend Strength is the top main driver
                  actual  Momentum Exhaustion
driver_direction  label   Trend Strength points bullish
                  actual  neutral
watch_condition   label   A warning or higher watch condition is present
                  actual  none
conflicts         label   No conflicting signals
                  actual  2 conflicting signals
freshness         label   State is fresh
                  actual  partial, 1 stale input
changed           label   Bias or main driver changed since the previous
                          snapshot
                  actual  no recorded change
```

The details each type pins down:

- **`score` / `risk_score`** compare strictly: `above 40` does not match
  a score of exactly `40`. `value` is a finite number, integer or not;
  it is not rounded before the comparison.
- **`main_driver`** reads `sourceWidget` on each `mainDrivers` entry,
  not the driver's own `id`, because driver ids are prefixed
  (`driver-trend_strength`) while `sourceWidget` is the widget id.
  `position` defaults to `"any"`; `"top"` restricts the check to
  `mainDrivers[0]`. A pair with no main drivers never matches.
- **`driver_direction`** looks at `mainDrivers` only. If no main driver
  carries that `sourceWidget`, the condition does not match and `actual`
  reads `no driver`. Conflicting signals are reachable through the
  `conflicts` condition; folding them in here would make one condition
  answer two questions.
- **`watch_condition`** filters `overview.watchConditions` by `ids` when
  given and by `minimumSeverity` when given (`info < warning <
  critical`), then asserts the filtered list is non-empty for
  `"present"` and empty for `"absent"`. With neither `ids` nor
  `minimumSeverity`, it asks whether the pair has any watch condition at
  all.
- **`conflicts`** accepts either shape. `{ state: "none" }` is
  `conflictingSignals.length === 0`, `{ state: "any" }` is `> 0`, and
  the operator form compares the count strictly the way `score` does.
- **`freshness`** is the only condition that reads `meta`. `"fresh"`
  requires both `meta.isPartial === false` and `meta.staleInputs.length
  === 0`; `"any"` always matches and exists so the control has an off
  position rather than needing the row removed.
- **`changed`** matches when `changedSincePrevious` contains at least
  one of the listed ids. A pair with no previous snapshot has an empty
  `changedSincePrevious` and never matches.

### Limits

```text
conditions        1 to 12 entries
filter            at most 2000 characters, before JSON.parse
match             "all" | "any", default "all"
```

An empty `conditions` array is a **400**, not an all-pairs result: a
scan with no conditions is Radar without the ranking, and the page that
answers "everything" already exists. Twelve is the ceiling because the
vocabulary is flat — twelve rows is already more than a builder UI reads
well, and each condition is a constant-time check against one overview,
so the bound is about legibility, not cost.

## Access

Minimum role `viewer`. The service opens with one call:

```ts
requireRole(options.session, "viewer");
```

`requireRole`, not `requireUser` (`src/lib/auth/access.ts:127`, which
is the check Watchlist needs). A scan owns no rows and reads
instance-wide market data, so a public-dashboard anonymous visitor —
`role: "viewer"`, `userId: null`, `isAuthenticated: false` from
`buildSession` (`src/lib/auth/access.ts:76-87`) — is a legitimate
caller, exactly as they are on Radar. There is no user-owned table here
and therefore no cross-user isolation rule to carry.

```text
401  anonymous with the public dashboard off
403  signed-in but below viewer
```

No role below `viewer` exists today, so the 403 path is unreachable in
practice; the access test still pins it, so that adding a lower role
later fails loudly here instead of silently widening the page.

Symbol reach is bounded exactly as Radar bounds it: the default symbol
set is the active `appConfig.symbols` filtered through
`canAccessSymbol(session, symbol)`, and an explicitly requested symbol
outside the session's `accessibleSymbols` is rejected rather than
scanned. A scan cannot widen what a session may read, and cannot be used
to probe whether a symbol it may not read has data.

## Layers

Stated against the layer rules in [CONTRIBUTING.md](../CONTRIBUTING.md).

**Service** — `src/lib/services/scanService.ts` owns filter parsing,
predicate evaluation and response assembly. It builds each pair's state
with `getSituationOverview({ symbol, timeframe, session, db, now,
evaluateAlerts: false })`, the same call
`opportunityRadarService.ts:241-248` already makes, and reuses the
builder rather than re-deriving state from widget results. Alert
evaluation stays off for the reason Radar keeps it off: opening a page
must not manufacture alert events for every scanned market.

**Route** — `src/app/api/scans/run/route.ts` with `runtime = "nodejs"`.
It reads the session with `getSessionFromRequest`, validates transport
shape, calls one service function, returns `okJson(...)`, and wraps the
handler in `try`/`catch` with `apiErrorJson`. No predicate logic, no
overview construction, no repository import.

**Components** — render what the API returned. No predicate evaluation,
no re-filtering of `items` in React, and no access decision that exists
only in the component.

**Widgets, indicators, collectors** — unchanged. A scan is a read over
stored state; no `WidgetContext` learns that a scan is running, and
widgets stay instance-wide and deterministic.

**Repositories** — none added. Scans reads through
`getSituationOverview` only.

Symbols come from `appConfig.symbols` and timeframes from
`collectionTimeframes` (`src/lib/config/timeframes.ts:1`). Neither is
hardcoded in the service, the route or the component — the Radar
foundation's module-level `symbols` / `timeframes` constants
(`src/components/radar/OpportunityRadarFoundation.tsx:28-29`) are a
precedent not to copy; the scans page reads its scope options from
`GET /api/symbols`.

## Storage

**None of its own.** No new table, no `schema.ts` change, and therefore
no database reset and no `assertCompatibleSchema` clause. A scan
computes on request.

It does, however, have one write side effect, which this spec states
rather than hides. `getSituationOverview` persists a snapshot when the
state materially changed or `minimumSnapshotIntervalMs` — 15 minutes,
`situationOverview.service.ts:41` — has elapsed since the stored one
(`shouldPersistOverview`, `situationOverview.service.ts:104-124`). So a
scan can append rows to `situation_overviews`, exactly as a Radar scan
can and as [OPPORTUNITY_RADAR.md](OPPORTUNITY_RADAR.md) documents. That
is the existing behaviour of the shared builder, not something Scans
adds, and a scan never writes anything else: no `alert_events`, no
`widget_results`, no candles, no collection run, no external call.

Saved scan definitions are deferred. When they land they would be a
user-owned table beside `watchlist_items`:

```text
id          INTEGER PRIMARY KEY AUTOINCREMENT
user_id     INTEGER NOT NULL  -> users(id) ON DELETE CASCADE
name        TEXT NOT NULL
filter_json TEXT NOT NULL
created_at  TEXT NOT NULL DEFAULT (datetime('now'))
updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
UNIQUE(user_id, name)
```

with an index led by `user_id`. Because there are no migrations, the
pull request adding it says which kind of schema change it is: a purely
additive table appears on an existing database by itself, since
`runMigrations` (`src/lib/db/migrations.ts:59`) execs `schemaSql` — all
`CREATE TABLE IF NOT EXISTS` — on every start, while a change to an
existing table's shape needs deleting `data/laripulse.sqlite` plus
`-wal`/`-shm` and running `npm run db:init`. Those rows would be
user-owned, so every query filters by the signed-in user and a
cross-user isolation test is required. None of that is in this feature.

## Validation

Reused from `src/lib/services/apiValidation.ts`:

- `ApiInputError` — carries the status code `apiErrorJson` returns.
- `validateSymbolAccess(symbol, session)` — `requireRole` plus
  `canAccessSymbol`, 400 otherwise.
- `validateCollectionTimeframe(timeframe)` — restricts to `15m`, `1h`,
  `4h`, `1d`. Added for Watchlist and reused here unchanged, which is
  what [WATCHLIST.md](WATCHLIST.md) anticipated. `7d`, `30d` and `90d`
  are chart ranges over daily candles, not collected timeframes, and a
  pair keyed to one has no Situation Overview of its own.
- `validateOptionalLimit(value, 50, 200)`.

Symbol and timeframe CSV parsing follows the Radar route's
`parseCsvParam` shape (`src/app/api/radar/opportunities/route.ts:11-19`)
— split on commas, trim, drop empties — and then validates each entry
rather than silently dropping unknown ones.

One function is added to `apiValidation.ts`:

```ts
validateJsonQueryParam(value: string | null, name: string, maxLength: number): unknown
```

It throws `ApiInputError` (400) when `value` is null or empty
(`${name} is required`), when its length exceeds `maxLength`
(`${name} must be at most ${maxLength} characters`), and when
`JSON.parse` fails (`${name} is not valid JSON`). It returns `unknown`
and asserts nothing about the parsed shape. It does **not** call
`decodeURIComponent`: `URLSearchParams.get` already returns the decoded
string, and decoding twice corrupts any value containing a literal `%`.

That helper is transport level only. The vocabulary check is
`parseScanFilter` in the service, exported so tests call it directly
without a route or a database. It throws `ApiInputError` (400) for a
non-object filter, a missing or non-array `conditions`, an empty or
over-long `conditions`, an unknown `match`, a condition that is not an
object, an unknown condition `type`, a missing or wrongly typed field on
a known type, an unknown enum value, an out-of-range `score` or
`risk_score` value, and an unknown widget id.

Widget ids in `main_driver` and `driver_direction` validate against
`isKnownWidgetId` from `src/lib/widgets/catalog.ts:163`, **not**
`validateWidgetId` from `apiValidation.ts`. `validateWidgetId` checks
`widgetRegistry`, which holds the crypto, liquidity and derivatives
engines only (`src/lib/widgets/registry.ts:36`); the cross-market
widgets that appear as drivers — `risk_regime`, `macro_risk_pulse`,
`dollar_pressure`, `nasdaq_crypto_correlation`,
`cross_market_divergence`, `gold_risk_hedge`, `oil_inflation_pressure` —
are in the catalog but not the registry, and validating against the
registry would reject a driver the overview can genuinely report.

## API

One route.

```text
GET /api/scans/run?symbols=BTCUSDT,ETHUSDT&timeframes=1h,4h&filter=<encoded JSON>&match=all&limit=50
```

### Request parameters

```text
symbols     optional CSV. Default: the session's accessible active
            symbols, in appConfig.symbols order. Each entry must be an
            active configured symbol the session may read.
timeframes  optional CSV. Default: all four collectionTimeframes, in
            that order.
filter      required. URL-encoded JSON: { match?, conditions[] }.
match       optional, "all" | "any". Applied only when the decoded
            filter omits match. Default "all".
limit       optional, 1..200, default 50. Caps items[], never the
            number of pairs examined.
```

`match` exists twice on purpose — inside the encoded filter for a
programmatic caller, and as its own parameter so a hand-written URL
stays readable — and the two never race: when both are present and
disagree, the request is a **400**. Silent precedence between two
sources of the same truth is the kind of thing nobody remembers
correctly six months later.

### Response

Under the `okJson` `{ status, data }` wrapper, so clients read
`json.data`:

```jsonc
{
  "status": "ok",
  "data": {
    "items": [
      {
        "symbol": "BTCUSDT",
        "timeframe": "4h",
        "bias": "bullish",
        "riskLevel": "moderate",
        "confidence": "high",
        "score": 61,
        "riskScore": 38,
        "title": "BTC is bullish with moderate risk",
        "summary": "Trend and volume agree while momentum stays contained.",
        "matchedConditions": [
          {
            "id": "c0",
            "type": "bias",
            "label": "Bias is bullish or strong bullish",
            "actual": "bullish"
          },
          {
            "id": "c1",
            "type": "conflicts",
            "label": "No conflicting signals",
            "actual": "0 conflicting signals"
          }
        ],
        "unmatchedConditions": [],
        "updatedAt": "2026-09-19T11:01:12.000Z"
      }
    ],
    "summary": {
      "examinedPairs": 8,
      "matchedPairs": 1,
      "requestedPairs": 8,
      "pairsWithoutState": [],
      "conditionSummary": [
        {
          "id": "c0",
          "type": "bias",
          "label": "Bias is bullish or strong bullish",
          "matchedPairCount": 3
        },
        {
          "id": "c1",
          "type": "conflicts",
          "label": "No conflicting signals",
          "matchedPairCount": 1
        }
      ],
      "match": "all",
      "generatedAt": "2026-09-19T11:04:00.000Z"
    }
  }
}
```

`items` holds **matches only**. A pair that did not match is not in the
list at any severity, because a near-miss is a non-match.

`matchedConditions` and `unmatchedConditions` are both
`{ id, type, label, actual }`: `label` is the condition as stated,
`actual` is the value found on that pair. Under `match: "all"` the
unmatched list is **always empty**, since a listed pair satisfied every
condition — said out loud here so nobody treats the field as dead code
and deletes it. Under `match: "any"` it carries the conditions the pair
missed, which is how a row explains why it is in the list.

`id` is assigned by the service as `c` plus the condition's zero-based
index in the requested order (`c0`, `c1`, …). Clients do not supply ids,
and the id is stable within one response only.

`conditionSummary` reports, per condition, how many **examined** pairs
satisfied it, independently of `match` and independently of whether the
pair matched overall. It is what explains an empty result set — a single
condition with `matchedPairCount: 0` names the one to loosen. It is per
condition, never per pair, so it stays an explanation rather than a
ranking by another name.

`requestedPairs` is `symbols.length × timeframes.length`;
`examinedPairs` is how many of those had state to examine;
`matchedPairs` is how many of the examined ones matched, before `limit`
truncates `items`.

`updatedAt` on an item is the overview's `generatedAt`.

### Ordering

Requested symbol order, then `collectionTimeframes` order — never by
score, never by how many conditions matched, never by recency. A scan
returns a set, and imposing an order on it would make it a ranking. The
ordering is deterministic, so the same stored state scanned twice
returns byte-identical `items`.

### Pairs without state

A pair counts as **examined** when at least one of its non-`context`
source widgets has status `used` or `stale`.
`SituationSourceWidget.contribution` is `primary` or `secondary` for the
pair-scoped crypto widgets and `context` for the instance-wide
cross-market ones (`situationOverview.rules.ts:524-534`), so requiring a
non-`context` contribution is what distinguishes "this pair has data" from
"the instance has macro data and this pair has nothing".

Everything else goes into `summary.pairsWithoutState` as
`{ symbol, timeframe }` and is left out of `items` and out of the
`conditionSummary` counts. That covers an uncollected symbol, a
timeframe that has never been collected, and the case where an admin has
hidden every crypto widget — in which case `expectedWidgetIds`
(`situationOverview.service.ts:43-46`) contains no pair-scoped widget at
all and no pair can be examined. A configured pair with no stored widget
results is **reported, not rejected**: it is a collection gap, and a 400
would tell the caller their filter was wrong when it was not.

Only an unknown or inaccessible symbol, or a timeframe outside
`collectionTimeframes`, is a 400.

### Status codes

```text
200  the scan ran, including when it matched nothing
400  unknown or inaccessible symbol
     timeframe outside collectionTimeframes
     missing, oversized or malformed filter
     empty or over-long conditions array
     unknown condition type, or a malformed condition of a known type
     unknown enum value in bias / risk_level / confidence /
       driver_direction / changed
     score outside -100..100, risk_score outside 0..100
     unknown widget id in main_driver or driver_direction
     match given twice with conflicting values
     limit outside 1..200
401  anonymous with the public dashboard off
403  signed-in but below viewer
```

### Curl

```bash
curl --get http://localhost:3000/api/scans/run \
  --data-urlencode 'symbols=BTCUSDT,ETHUSDT' \
  --data-urlencode 'timeframes=1h,4h' \
  --data-urlencode 'filter={"conditions":[{"type":"bias","in":["bullish","strong_bullish"]},{"type":"conflicts","state":"none"}]}'

curl --get http://localhost:3000/api/scans/run \
  --data-urlencode 'match=any' \
  --data-urlencode 'filter={"conditions":[{"type":"risk_level","in":["high","extreme"]},{"type":"watch_condition","state":"present","minimumSeverity":"warning"}]}'
```

## Service Signatures

In the options-object style the other services use, with an optional
`db` so tests pass an in-memory database:

```ts
parseScanFilter(value: unknown): ScanFilter

evaluateScanFilter(filter: ScanFilter, overview: SituationOverview): ScanMatch

runScan(options: {
  session: AuthSession;
  filter: ScanFilter;
  symbols?: string[];
  timeframes?: string[];
  limit?: number;
  db?: Database.Database;
  now?: Date;
}): Promise<ScanRunResponse>
```

`evaluateScanFilter` is **pure** — an overview in, a match out. No
database, no session, no clock. That is what makes the whole predicate
table testable on fixed fixtures with exact expected values, the way
indicators and widgets are tested.

The types:

```ts
type ScanMatchMode = "all" | "any";

type ScanCondition =
  | { type: "bias"; in: SituationBias[] }
  | { type: "risk_level"; in: SituationRiskLevel[] }
  | { type: "confidence"; in: SituationConfidence[] }
  | { type: "score"; operator: ScanOperator; value: number }
  | { type: "risk_score"; operator: ScanOperator; value: number }
  | { type: "main_driver"; widgetIds: string[]; position?: "top" | "any" }
  | { type: "driver_direction"; widgetId: string; in: SituationDriverDirection[] }
  | {
      type: "watch_condition";
      state: "present" | "absent";
      ids?: string[];
      minimumSeverity?: SituationWatchCondition["severity"];
    }
  | { type: "conflicts"; state: "none" | "any" }
  | { type: "conflicts"; operator: ScanOperator; value: number }
  | { type: "freshness"; state: "fresh" | "any" }
  | { type: "changed"; ids: SituationChangeId[] };

type ScanOperator = "above" | "below";

interface ScanFilter {
  match: ScanMatchMode;
  conditions: ScanCondition[];
}

interface ScanConditionResult {
  id: string;
  type: ScanCondition["type"];
  label: string;
  actual: string;
}

interface ScanMatch {
  matched: boolean;
  matchedConditions: ScanConditionResult[];
  unmatchedConditions: ScanConditionResult[];
}

interface ScanResultItem {
  symbol: string;
  timeframe: string;
  bias: SituationBias;
  riskLevel: SituationRiskLevel;
  confidence: SituationConfidence;
  score: number;
  riskScore: number;
  title: string;
  summary: string;
  matchedConditions: ScanConditionResult[];
  unmatchedConditions: ScanConditionResult[];
  updatedAt: string;
}

interface ScanRunSummary {
  examinedPairs: number;
  matchedPairs: number;
  requestedPairs: number;
  pairsWithoutState: Array<{ symbol: string; timeframe: string }>;
  conditionSummary: Array<{
    id: string;
    type: ScanCondition["type"];
    label: string;
    matchedPairCount: number;
  }>;
  match: ScanMatchMode;
  generatedAt: string;
}

interface ScanRunResponse {
  items: ScanResultItem[];
  summary: ScanRunSummary;
}
```

`parseScanFilter` normalises as well as validates: it fills `match` with
`"all"` when absent and `position` with `"any"` when absent, so
`evaluateScanFilter` never sees an optional it has to re-default. Its
return value is the only shape `runScan` accepts, so an unvalidated
filter cannot reach evaluation.

All of these are declared in the service and re-exported from
`src/lib/api/types.ts`, where the Radar and Watchlist API types already
are (`src/lib/api/types.ts:273-295`).

## UI

`/scans` is a guarded page:

```tsx
export default async function ScansPage() {
  const session = await requirePageSession("/scans");

  return (
    <SessionProvider session={session}>
      <ScansFoundation />
    </SessionProvider>
  );
}
```

The default `minimumRole: "viewer"` and **no** `signedIn: true`, unlike
Watchlist: a scan owns no rows, so it has something to show an anonymous
visitor when the public dashboard is on. The shape follows
`src/app/radar/page.tsx` — a server guard wrapping `SessionProvider`
around a client foundation component.

`requirePageSession` goes through `pageInstanceStatus()`, which awaits
`connection()` (`src/lib/auth/pageGuard.ts:14`). Without that the route
is prerendered as a static redirect to `/setup` and a built instance is
permanently broken, so the route must appear as `ƒ` and not `○` in
`next build` output. Check the build output before the pull request.

### Shell

`AppShell`'s `activeItem` union
(`src/components/dashboard/primitives.tsx:408`) gains `"scans"`, and the
nav item at `src/components/dashboard/primitives.tsx:422` loses
`disabled: true` and gains `active: activeItem === "scans"` and an
`onClick` pushing `/scans`. It takes **no** `hidden`, matching Radar:
the page is open to everyone the guard lets through, including the
public-dashboard anonymous visitor.

### Foundation component

`src/components/scans/ScansFoundation.tsx`, following
`src/components/radar/OpportunityRadarFoundation.tsx`:

- symbol and timeframe scope chips, their options read from
  `GET /api/symbols` — `listSymbols` already returns the active symbols
  only — and from `collectionTimeframes`, rather than a hardcoded list
- a condition builder that adds one row per condition, each row a type
  selector from the closed vocabulary plus that type's own controls —
  a multi-select for the `in` types, a signed range for `score`, an
  unsigned one for `risk_score`, a widget picker for the driver types
- an all/any toggle bound to `match`
- result cards reusing `GlassCard`, `GlassPanel`, `StatusBadge`,
  `MetricPill` and `EmptyState` from
  `src/components/dashboard/primitives.tsx`
- matched and unmatched conditions rendered as their `label` with
  `actual` beside it, never as raw JSON

The builder composes the filter, encodes it and issues one
`GET /api/scans/run`. It never evaluates a condition itself and never
re-filters `items`. Dates render through `formatLocalDateTime` /
`replaceIsoDatesWithLocalTime` from `src/lib/utils/formatDateTime`, so
stored UTC strings are not shown raw.

### States

Each is a state the implementation must render, and the E2E and manual
passes walk them:

| State | What renders |
| --- | --- |
| Initial | `EmptyState`: what a scan is, and the control to add the first condition. Nothing has run |
| Building | One row per condition with its own controls; the run control is enabled from the first valid condition |
| Running | The run control and the builder disable; the previous results stay on screen rather than blanking |
| Matches | One `GlassCard` per item in the returned order, each naming its matched conditions with the value found |
| No matches | An `EmptyState` plus the `conditionSummary` breakdown, leading with the condition whose `matchedPairCount` is lowest — the one to loosen |
| Pairs without state | A muted panel listing `summary.pairsWithoutState` and pointing at collection, shown alongside matches rather than instead of them |
| Invalid filter | The 400 message renders inline on the builder; the previous results are left intact and nothing is cleared |
| Load error | An error panel with the message and a retry that re-issues the same request |
| Anonymous, public dashboard off | The page never renders; the guard redirects to `/login?next=%2Fscans` |

Nothing on the page ranks the matches, scores them, or phrases a result
as something to do.

## Tests

By file and by case.

**`test:services` — `src/lib/services/scanService.test.ts`**

- one case per condition type, asserting exact `matchedConditions` and
  `unmatchedConditions` output — including `label` and `actual` — from
  `evaluateScanFilter` against a fixed `SituationOverview` fixture. The
  `overview()` helper in
  `src/lib/services/opportunityRadarService.test.ts:17-50` is the model
- the boundaries: `score` `above 40` does not match a score of exactly
  `40`; a negative score matches `below 0`; `risk_score` at `0` and
  `100`
- `main_driver` with `position: "top"` does not match a widget that is a
  lower main driver; `driver_direction` for a widget with no driver
  reports `no driver` and does not match
- `watch_condition` with `minimumSeverity: "warning"` ignores an `info`
  condition; `state: "absent"` matches a pair whose only watch condition
  was filtered out
- `match: "all"` versus `match: "any"` over the same conditions and the
  same overview, asserting that the unmatched list is empty under
  `"all"` and populated under `"any"`
- `parseScanFilter` rejects each invalid shape with `ApiInputError` and
  status 400: non-object, missing `conditions`, empty `conditions`,
  thirteen conditions, unknown `type`, unknown `match`, unknown enum
  value, out-of-range `score` and `risk_score`, unknown widget id, and a
  cross-market widget id accepted where the registry would reject it
- `parseScanFilter` defaults `match` to `"all"` and `position` to
  `"any"`
- a pair with no stored widget results lands in
  `summary.pairsWithoutState`, is absent from `items`, and is excluded
  from every `conditionSummary` count, on a seeded database
- `conditionSummary` counts on a seeded two-symbol database, asserting
  exact `matchedPairCount` per condition including a condition no pair
  satisfies
- ordering is the requested symbol order then the `collectionTimeframes`
  order, with a requested order that is not alphabetical
- determinism: the same seeded state scanned twice returns identical
  output, with a fixed `now`
- a scan writes no `alert_events` even when an alert rule that would
  fire for the scanned pair exists
- an anonymous session with the public dashboard off throws 401; a
  public-dashboard session with `role: "viewer"` and `userId: null` runs
  and returns results

**`test:auth` — `src/lib/auth/access.test.ts`**

- anonymous with the public dashboard off against a `viewer`
  requirement: 401
- the public-dashboard anonymous viewer passes `requireRole(session,
  "viewer")`, which is what lets a scan run for them
- a requested symbol outside `accessibleSymbols` is rejected by
  `validateSymbolAccess` rather than scanned

**`test:e2e` — `tests/e2e/scans.spec.ts`**

- the sidebar item is enabled and navigates — through the `<aside>` on
  `chromium-desktop` and the drawer below `lg`, as
  `tests/e2e/navigation.spec.ts` does
- building a filter from the builder and reading the results
- a filter that matches nothing shows the no-match explanation with the
  `conditionSummary` breakdown
- an invalid filter shows the inline message and leaves the previous
  results on screen

All four run on the three configured viewports. `/api/scans/run` is
mocked from a `tests/e2e/scans.fixtures.ts` module the way
`tests/e2e/dashboard.fixtures.ts` mocks the market APIs: the first-run
E2E database has no widget results, so an unmocked scan could only ever
exercise the pairs-without-state path, and the match, no-match and
invalid cases each need a payload the suite controls.

### What the implementing pull request runs

Per the definition of done: `npm run lint`, `npm run typecheck`, the
eight unit test scripts, `npm run build` — `/scans` is a guarded page,
so check it shows as `ƒ` — and `npm run test:e2e`, because this adds a
UI flow.

## Guardrails

- No predicate logic in the route handler and none in React. The route
  validates transport shape and calls one service function.
- No alert evaluation during a scan: `evaluateAlerts: false` on every
  `getSituationOverview` call.
- No bypass of symbol access. The default set is filtered by
  `canAccessSymbol` and an explicit request is checked against it.
- No ranking, no scoring, no ordering by relevance, and no near-miss
  list. `items` is a set in a deterministic order.
- No new collector, widget, indicator, external data source, queue,
  worker or cache. Scans reads stored state through existing services.
- Nothing rendered or returned is phrased as a prediction, a
  recommendation, an entry, an exit, a price target or a position size.

## Open Questions

- **Saved scan definitions.** Deferred, and the first thing here that
  would need a table and a `schema.ts` pull request. Until then a scan
  lives in the URL, which is shareable but not durable.
- **A cost ceiling on the scanned pair count.** A scan builds one
  Situation Overview per requested pair — twelve today, three symbols
  across four timeframes — and each one reads that pair's widget
  results, the cross-market widgets and a market overview. This spec
  imposes no cap beyond `limit`, which bounds the response rather than
  the work. Whether the number of scanned pairs needs its own bound is
  the maintainer's call once symbol configuration grows.
- **Opening a match on the dashboard** at its symbol and timeframe. A
  small follow-on, out of scope as specified above.
