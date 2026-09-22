# Insights

Insights is a deterministic read of what changed across a window,
assembled only from already persisted snapshots: bias and risk
transitions, drivers that kept recurring, conflicts that persisted, the
watch conditions that were raised, how complete the data behind them
was, and the alert events the signed-in user's own rules produced.

It is not a model, not generated prose, not a forecast, and not advice.
Every sentence is a template filled from stored values, and every line
carries the row identifiers it came from, so a reader can go back to the
snapshot that produced it. Nothing here is phrased as an entry, an exit,
a price target or a position size, and nothing says what happens next.

The boundary against the existing pages is the point of the feature.
[Situation Overview](SITUATION_OVERVIEW.md) answers "what is the state
right now", [Opportunity Radar](OPPORTUNITY_RADAR.md) answers "what
deserves attention right now", [Scans](SCANS.md) answers "which markets
match the conditions I named", and Insights answers "what changed over
the window I chose". It is the only one of the four that reads a range
of stored rows rather than the latest state.

This document specifies the feature before it is built. The section
list, the template text, the route, the payload shapes, the function
signatures, the UI states and the test names below are the contract, and
a change to any of them is a change to this file first.

## Scope

Implemented:

- Nothing yet.

Not implemented:

- `src/lib/services/insights/insights.types.ts`,
  `insights.rules.ts` and `insights.service.ts`.
- `listSituationOverviewsInRange` in
  `src/lib/db/repositories/situationOverviewRepository.ts`.
- `listAlertEventsInRange` in
  `src/lib/db/repositories/alertRepository.ts`.
- `GET /api/insights` (`src/app/api/insights/route.ts`).
- `/insights` page and the enabled sidebar item.
- `src/components/insights/InsightsFoundation.tsx`.

Out of scope:

- Any model in the text path. No generated, paraphrased or reworded
  sentence; every string is one of the templates below.
- Any statement about what happens next, or about what to do.
- New collectors, widgets, indicators or external data sources.
- A scheduled writer that keeps `situation_overviews` populated. Insights
  reads what is there; see [Open Questions](#open-questions).
- Export or download. That is [Reports](REPORTS.md).
- Multi-pair insights across the watchlist. See
  [Open Questions](#open-questions).

## What It Reads

One pair, one timeframe, one window. Two tables, and the exact columns
below — nothing else.

| Section | Table | Columns and JSON fields |
| --- | --- | --- |
| `window-coverage` | `situation_overviews` | `id`, `generated_at` |
| `bias-transitions` | `situation_overviews` | `id`, `generated_at`, `bias` |
| `risk-transitions` | `situation_overviews` | `id`, `generated_at`, `risk_level` |
| `recurring-drivers` | `situation_overviews` | `id`, `generated_at`, `main_drivers_json` → `sourceWidget`, `label`, `direction` |
| `persistent-conflicts` | `situation_overviews` | `id`, `generated_at`, `conflicting_signals_json` → `sourceWidget`, `label`, `direction` |
| `watch-conditions` | `situation_overviews` | `id`, `generated_at`, `watch_conditions_json` → `id`, `label`, `condition`, `severity` |
| `data-coverage` | `situation_overviews` | `id`, `confidence`, `meta_json` → `isPartial`, `staleInputs`, `missingInputs` |
| `alert-activity` | `alert_events` | `id`, `created_at`, `severity`, `title`, `symbol`, `timeframe`, `acknowledged_at` |

Both tables are declared in `src/lib/db/schema.ts` —
`situation_overviews` at `src/lib/db/schema.ts:107-127` and
`alert_events` at `src/lib/db/schema.ts:154-174` — and both are read
through their existing repositories.

### What it deliberately does not read

**`widget_results`.** A snapshot already carries its own drivers,
conflicts, watch conditions and input state, frozen at the moment it was
generated. Reading the latest widget results alongside a window would
mix current state into a historical read and produce lines that are true
of neither. Insights never touches `widget_results`, never calls
`listLatestWidgetResultsWithDerivedLiquidity`, and never builds a
`WidgetContext`.

**`getSituationOverview`.** Unlike [Scans](SCANS.md), Insights does not
call the overview builder at all. That call has a write side effect —
it persists a snapshot when state materially changed or
`minimumSnapshotIntervalMs` has elapsed
(`src/lib/services/situationOverview/situationOverview.service.ts:41`) —
and a window read that appends a row to the window it is reading is not
a read. This also means Insights needs no `await`; see
[Service Signatures](#service-signatures).

**`changes_json`.** The obvious source for transitions is the wrong one.
`changedSincePrevious` is truncated with `.slice(0, 5)`
(`src/lib/services/situationOverview/situationOverview.rules.ts:651`),
and its score entry only fires at `Math.abs(previous.score -
current.score) >= 15`
(`src/lib/services/situationOverview/situationOverview.rules.ts:618`),
so it is a capped, thresholded summary rather than a complete record.
Transitions derive from consecutive stored `bias` and `risk_level`
values instead, which is the full record by construction.

**`score` and `risk_score`.** No section reads them. A score series over
a window is a chart, and putting one in a text feature invites a line
about where it is heading. The two transition sections read the
categorical `bias` and `risk_level` columns only.

**`title`, `summary`, `data_warnings_json`, `source_widgets_json` and
`created_at` on `situation_overviews`.** `title` and `summary` are
sentences the overview rules already composed for a single moment;
Insights composes its own text for a window rather than quoting them.
`data_warnings_json` restates `meta_json` in prose and adds the standing
`liquidations-local-history` notice, so `data-coverage` reads `meta_json`
directly. `source_widgets_json` is per-widget status for one snapshot,
which `meta_json` already summarises. `created_at` is the insert time;
`generated_at` is the time the state describes, and that is the one a
window is cut against.

## Two Things The Stored Timestamps Get Wrong

The two tables store time in two different formats, and mixing them is
the one way to get this feature silently wrong.

```text
situation_overviews.generated_at   2026-09-19T11:01:12.000Z
alert_events.created_at            2026-09-19 11:01:12
```

`generated_at` is written from `generatedAt.toISOString()`
(`src/lib/services/situationOverview/situationOverview.rules.ts:712`).
`alert_events.created_at` takes the column default, `datetime('now')`
(`src/lib/db/schema.ts:169`), which is UTC with a space separator, no
`T`, no fractional seconds and **no zone marker**.

**Each format is self-comparable; the two are not comparable to each
other.** Both sort correctly as strings against their own column, which
is what makes a `BETWEEN` on either one safe. `"2026-09-19T11:01:12.000Z"
> "2026-09-19 11:01:12"` is also true as a string comparison, but that is
an artifact of `T` sorting above a space, not a time comparison, and it
is wrong the moment the dates differ. Nothing in this feature compares a
value from one column against a value from the other.

**A range bound is formatted per table**, never once and reused:

```ts
situationOverviewBound(at: Date)  // at.toISOString()
alertEventBound(at: Date)         // at.toISOString().slice(0, 19).replace("T", " ")
```

`alertEventBound` truncates sub-second precision, so the lower bound
rounds down and the window is up to one second wider on the alert side
than on the snapshot side. That is stated rather than corrected: padding
the bound to hide it would trade a known sub-second difference for an
unknown one.

**`new Date("2026-09-19 11:01:12")` parses as local time.** The string
has no zone marker, so every runtime reads it in the host's zone, and a
server in UTC+3 turns an 11:01 UTC event into an 08:01 UTC instant. So
`insights.service.ts` normalises every alert timestamp to ISO before it
reaches the pure layer:

```ts
toIsoTimestamp(stored: string)  // `${stored.replace(" ", "T")}Z`
```

Applied to `created_at` and, where it is not null, `acknowledged_at`.
After that one call, every timestamp anywhere in this feature — in
`values`, inside a `text`, in `coveredWindow` and in `generatedAt` — is
an ISO string ending in `Z`, which is also what lets the UI run
`replaceIsoDatesWithLocalTime` over a line's text and have it work; see
[UI](#ui).

This is a normalisation Insights performs on its own reads. The existing
Alerts page does not, and that is a separate pre-existing defect noted
under [Open Questions](#open-questions).

## Window And Coverage

### The window

`range` picks the window length, and the window is the closed interval
ending now:

```text
1d    86_400_000 ms
7d    604_800_000 ms
30d   2_592_000_000 ms
90d   7_776_000_000 ms

requestedWindow = { from: now - rangeMs, to: now }
```

Both bounds are inclusive. A snapshot whose `generated_at` equals either
bound exactly is in the window. `now` is `options.now ?? new Date()`, so
a test fixes it and gets byte-identical output.

`coveredWindow` is the span the stored rows actually occupy —
`{ from: oldest.generatedAt, to: newest.generatedAt }` — and is `null`
when the window holds no snapshot. It is almost always narrower than
`requestedWindow`, because `situation_overviews` only gains a row when
someone opened a page that built an overview and the state had
materially changed or fifteen minutes had passed. The response carries
both so a reader can see the difference rather than assume the window
was full.

### The minimum

```text
minimumSnapshots = 3
```

A window with two snapshots has exactly one interval in it. Calling one
interval a transition record, or one repeated driver a recurrence, is
over-reading, and the honest answer is to say how little is there.

```text
0 snapshots        coverage "empty"
1 or 2 snapshots   coverage "insufficient", naming the count
3 or more          coverage "reported"
```

This applies to the six market sections that read snapshot content.
**`window-coverage` always reports**, at every count including zero,
because it is the section that states the shortage — a section that went
`empty` to announce emptiness would say nothing. `alert-activity` has
its own rule, below.

`coverage` is per section and always present, so a client never has to
infer from an empty `lines` array why a section said nothing.

```text
reported       rows were read and the finding is stated, including
               when the finding is that nothing changed
insufficient   rows exist but fewer than the section needs
empty          the window holds no rows of the kind the section reads
omitted        the section was not computed; the line says why
```

"Nothing changed" is a finding, not an absence. A window of fourteen
snapshots that all read `bullish` is `reported` with one line saying so,
not `empty`.

### The caps

```text
maxSnapshotsPerWindow      5000
maxAlertEventsPerWindow    500
maxTransitionLines         20     per transition section
maxListedLinesPerSection   6      per grouped section
```

Both row caps are applied as the repository `limit` on a newest-first
query, so **truncation drops the oldest rows**, and `coveredWindow.from`
becomes the oldest row that survived rather than the oldest row in the
window. `truncated` on the response is true when the snapshot read hit
its cap.

Every over-cap case states what it left out, by count, in its own line.
A cap that silently changes the answer is worse than no cap.

## Sections

Eight sections, in this fixed order, **every one always present in the
array** with its own `coverage`. A client renders them in the order it
received them and never has to test for a missing key.

```text
1  window-coverage      market    Window coverage
2  bias-transitions     market    Bias transitions
3  risk-transitions     market    Risk transitions
4  recurring-drivers    market    Recurring drivers
5  persistent-conflicts market    Persistent conflicts
6  watch-conditions     market    Watch conditions
7  data-coverage        market    Data coverage
8  alert-activity       personal  Alert activity
```

### Rules that hold across sections

- **Time-ordered lines read oldest-first.** The two transition sections
  list their lines from the earliest transition to the latest. Grouped
  sections have no time order of their own and are ordered by count,
  then recency, as each states below.
- **Transitions derive from consecutive rows**, never from
  `changes_json`, and each transition line carries the gap between the
  two rows it came from.
- **Drivers and conflicts group by `sourceWidget`**, falling back to the
  driver's `id` when `sourceWidget` is absent, and are **listed only
  from two appearances up**. One appearance is not a recurrence.
- **Watch conditions group by the condition `id` and are listed from one
  appearance**, because a single critical watch condition in the window
  is a fact, not a trend, and suppressing it would lose the most useful
  thing in the section.
- **Underscores become spaces** in every stored enum rendered into text:
  `strong_bullish` reads `strong bullish`, `risk_on` reads `risk on`.
  This matches
  `src/lib/services/situationOverview/situationOverview.rules.ts:604`.
- **Widget names come from the catalog**:
  `getWidgetCatalogItem(widgetId)?.title ?? widgetId.replaceAll("_", " ")`,
  the same expression
  `src/lib/services/situationOverview/situationOverview.rules.ts:84-86`
  uses. `getWidgetCatalogItem` (`src/lib/widgets/catalog.ts:159`) is a
  pure lookup over a module constant, so the pure layer stays pure.
- **Ties break deterministically.** Every ordering below ends in an
  ascending sort on a stable string key, so the same rows always produce
  the same line order.

### Shared text helpers

Pinned here because the tests assert exact strings.

```text
joinWithAnd(items)
  []               ""
  ["a"]            "a"
  ["a","b"]        "a and b"
  ["a","b","c"]    "a, b and c"

formatDuration(ms)
  < 1 minute       "under a minute"
  < 1 hour         "1 minute" / "{m} minutes"
  < 1 day          "1 hour" / "{h} hours" / "{h} hours {m} minutes"
  otherwise        "1 day" / "{d} days" / "{d} days {h} hours"
```

`formatDuration` floors each component and omits a trailing component
that is zero, so `3_600_000` is `"1 hour"` and `3_660_000` is
`"1 hour 1 minute"`.

Timestamps appear inside `text` as full ISO strings. The UI converts
them; the service does not.

### 1. `window-coverage`

Always `coverage: "reported"`. Lines, in order:

```text
window-snapshots
  n = 0    No situation snapshot was stored in the requested 7d window.
  n = 1    1 situation snapshot covers the requested 7d window.
  n > 1    {n} situation snapshots cover the requested 7d window.

window-span            (n >= 1)
  n = 1    The only stored snapshot is from 2026-09-14T08:00:00.000Z.
  n > 1    The covered span runs 2026-09-14T08:00:00.000Z to
           2026-09-19T11:01:12.000Z, narrower than the requested 7d
           window.

window-gap             (n >= 2)
           The largest gap between consecutive snapshots is 2 days
           3 hours.

window-insufficient    (n = 1 or 2)
  n = 1    Only 1 snapshot was stored in this window, fewer than the 3
           this feature needs, so the sections below report the shortage
           rather than a trend.
  n = 2    Only 2 snapshots were stored in this window, fewer than the 3
           this feature needs, so the sections below report the shortage
           rather than a trend.

window-truncated       (truncated)
           This window held more than 5000 snapshots; the 5000 most
           recent were read and 412 older ones were left out.
```

`window-span` is emitted whenever there is at least one snapshot, with
no test for whether the span is narrower — over a real window it always
is, and a conditional that never fires is dead code someone later
deletes.

`sourceRows` on `window-span` carries the oldest and newest ids; on
`window-snapshots` and `window-gap` it carries the ids behind the
statement — every id for the count, the two ids either side of the
largest gap.

### 2. `bias-transitions`

Walk the snapshots oldest-first. Emit a transition wherever
`rows[i].bias !== rows[i - 1].bias`.

```text
bias-transition-{previousId}-{currentId}
  Bias moved from bullish to neutral at 2026-09-17T09:30:00.000Z,
  4 hours 12 minutes after the previous snapshot.

bias-steady            (no transitions)
  Bias held at bullish across all 14 snapshots.

bias-truncated         (more than 20 transitions)
  Bias changed 27 times in this window; the 20 most recent are listed
  and 7 earlier ones were left out.
```

`values` on a transition line: `{ previous, current, at, gapMs }`, with
`previous` and `current` as the stored enum, underscores intact, and the
text rendering them with spaces. `sourceRows` is
`[{ table: "situation_overviews", ids: [previousId, currentId] }]`.

The cap keeps the **most recent** 20 and still renders them oldest-first
among those kept, so the section reads forwards while dropping the
stale end. `bias-truncated` is the last line.

`bias-steady` uses the single bias value the whole window held; at
`unknown` it reads `Bias held at unknown across all 14 snapshots.`,
which is a real finding about a collection gap.

### 3. `risk-transitions`

Identical in shape over the `risk_level` column. Risk level values carry
no underscores.

```text
risk-transition-{previousId}-{currentId}
  Risk level moved from moderate to elevated at
  2026-09-17T09:30:00.000Z, 4 hours 12 minutes after the previous
  snapshot.

risk-steady
  Risk level held at moderate across all 14 snapshots.

risk-truncated
  Risk level changed 27 times in this window; the 20 most recent are
  listed and 7 earlier ones were left out.
```

### 4. `recurring-drivers`

Parse `main_drivers_json` on each snapshot into `SituationDriver[]` and
group by `sourceWidget ?? id`. For each group: the number of **distinct
snapshots** it appeared in, the direction in its earliest and latest
appearance, and the `label` from the **most recent** snapshot it appeared
in — the label is regenerated per snapshot from the catalog, so the
newest one is the one that matches the current catalog.

Listed from two appearances up. Ordered by appearance count descending,
then by most recent appearance descending, then by group key ascending.

```text
driver-{groupKey}
  constant direction
    Trend Strength was a main driver in 11 of 14 snapshots, holding
    bullish.
  changed direction
    Momentum Exhaustion was a main driver in 6 of 14 snapshots, moving
    from neutral to bearish.

drivers-none           (no snapshot recorded any main driver)
  No snapshot in this window recorded a main driver.

drivers-no-recurrence  (drivers exist, none reached two appearances)
  No widget was a main driver in more than one snapshot.

drivers-truncated      (more than 6 groups qualify)
  9 widgets recurred as main drivers; the 6 most frequent are listed
  and 3 others were left out.
```

"Moving from A to B" compares the first and last appearance only. A
driver that went bullish, neutral, bullish has a constant first and last
and reads as `holding bullish`; the line is about where the window
started and ended, and saying more would need a per-snapshot list this
section deliberately does not produce.

`values`: `{ sourceWidget, label, count, snapshotCount, firstDirection,
lastDirection, mostRecentAt }`. `sourceRows` carries every snapshot id
the group appeared in, in ascending order.

### 5. `persistent-conflicts`

The same aggregation over `conflicting_signals_json`, which holds
`SituationDriver[]` as well.

```text
conflict-{groupKey}
  Dollar Pressure conflicted with the overall bias in 9 of 14 snapshots,
  holding risk off.
  Volume Confirmation conflicted with the overall bias in 4 of 14
  snapshots, moving from bearish to neutral.

conflicts-none
  No snapshot in this window recorded a conflicting signal.

conflicts-no-recurrence
  No widget conflicted with the overall bias in more than one snapshot.

conflicts-truncated
  8 widgets conflicted more than once; the 6 most frequent are listed
  and 2 others were left out.
```

### 6. `watch-conditions`

Parse `watch_conditions_json` into `SituationWatchCondition[]` and group
by the condition `id` — `watch-support-loss`,
`watch-resistance-reclaim`, `watch-volume-confirmation`,
`watch-confirmation` today
(`src/lib/services/situationOverview/situationOverview.rules.ts:433-474`).
Grouping by `sourceWidget` would be wrong here: `watch-confirmation`
carries none, and two conditions from the same widget are two different
statements.

Listed from **one** appearance. Severity is the highest the group
reached across its appearances, over `info < warning < critical`.
Ordered by severity descending, then appearance count descending, then
most recent appearance descending, then condition `id` ascending.

```text
watch-{conditionId}
  Support pressure was raised in 7 of 14 snapshots at warning severity,
  most recently at 2026-09-19T11:01:12.000Z.

watch-none
  No watch condition was raised in this window.

watch-truncated
  9 watch conditions were raised; the 6 most significant are listed and
  3 others were left out.
```

`values`: `{ conditionId, label, severity, condition, count,
snapshotCount, mostRecentAt }`. `condition` is the stored condition
text from the most recent appearance, carried so the UI can show it
under the line without the service folding a second sentence into
`text`.

### 7. `data-coverage`

Four lines, always all four when the section is `reported`, in this
order. Counts are over snapshots, not over widgets.

```text
coverage-partial
  k = 0    Every snapshot in this window was built from the full
           expected input set.
  k = 1    1 of 14 snapshots was partial, built without every expected
           input.
  k > 1    6 of 14 snapshots were partial, built without every expected
           input.

coverage-stale
  k = 0    No snapshot reported a stale input.
  k >= 1   Stale inputs appeared in 6 of 14 snapshots: Volume Confirmation,
           Macro Risk Pulse and Gold / Risk Hedge.

coverage-missing
  k = 0    No snapshot reported a missing input.
  k >= 1   Missing inputs appeared in 2 of 14 snapshots: Derivatives
           Pressure.

coverage-confidence
  constant Confidence was medium in all 14 snapshots.
  varying  Confidence was high in 8 snapshots, medium in 5 and low in 1.
```

`coverage-partial` counts snapshots whose `meta.isPartial` is true.
`coverage-stale` and `coverage-missing` count snapshots with a non-empty
`meta.staleInputs` / `meta.missingInputs`, and name the widgets ordered
by how many snapshots each appeared in, descending, then by widget id
ascending, joined with `joinWithAnd`. At most six names, with
`and 3 others` appended in place of the seventh onward:
`Stale inputs appeared in 9 of 14 snapshots: A, B, C, D, E, F and
3 others.`

`coverage-confidence` lists the three values in the fixed order `high`,
`medium`, `low`, omitting any with a zero count, joined with
`joinWithAnd`. The fixed order is not a ranking of the window; it is a
reading order, so the line does not reshuffle between requests.

`sourceRows` on each line carries the ids of the snapshots it counted —
every id for `coverage-confidence`, the matching subset for the other
three.

### 8. `alert-activity`

The only `personal` section. It reads `alert_events` for the signed-in
user and nobody else.

**When the session cannot have it** — anonymous, or signed in below
`analyst` — the section comes back `coverage: "omitted"` with one line
and the request still succeeds:

```text
alerts-omitted
  Alert activity is personal to a signed-in account with the analyst
  role, so it is not included in this response.
```

One template covers both cases on purpose. Distinguishing "you are not
signed in" from "your role is too low" in a public response tells an
anonymous caller something about the instance's role configuration for
no benefit to a legitimate one.

**When the window holds no event** — `coverage: "empty"`:

```text
alerts-none
  No alert event was raised for your account in this window.
```

**Otherwise** — `coverage: "reported"`, lines in this order:

```text
alerts-count
  k = 1    1 alert event was raised for your account in this window.
  k > 1    9 alert events were raised for your account in this window.

alert-group-{index}    (grouped by title and severity)
  k = 1    Risk level changed fired once at warning severity, at
           2026-09-18T14:00:00.000Z.
  k > 1    Situation bias changed fired 4 times at warning severity,
           most recently at 2026-09-19T10:15:00.000Z.

alerts-unacknowledged
  k = 0    All of those events were acknowledged.
  k = 1    1 of those events is still unacknowledged.
  k > 1    3 of those events are still unacknowledged.

alerts-truncated       (the alert read hit its cap)
  This window held more than 500 alert events; the 500 most recent were
  read and 63 older ones were left out.
```

Groups are keyed on `(title, severity)` and ordered by severity
descending over `info < warning < critical`, then count descending, then
most recent descending, then title ascending. `alert-group-{index}` uses
the zero-based position in the rendered order as its id, because
`alert_events.title` is free text and is not safe in an identifier.

Group lines are capped at `maxListedLinesPerSection`. When more than six
groups qualify, a seventh line with id `alerts-groups-truncated` follows
them and reads `12 alert titles fired in this window; the 6 most
significant are listed and 6 others were left out.` That is separate
from `alerts-truncated`, which is about the 500-row read cap and can
appear alongside it: one says the response left groups out, the other
says the read left events out, and a window can hit both.

`values` on a group line: `{ title, severity, count, mostRecentAt }`.
`sourceRows` is `[{ table: "alert_events", ids: [...] }]` with every
event id in the group, ascending. Every timestamp here has already been
through `toIsoTimestamp`.

`alert-activity` is not subject to `minimumSnapshots`. Alert events are
their own rows, and one event is a complete fact about the window.

## Access

The request needs `viewer`. The service opens with one call:

```ts
requireRole(options.session, "viewer");
```

`requireRole` (`src/lib/auth/access.ts:114`), not `requireUser`
(`src/lib/auth/access.ts:127`). The seven market sections read
instance-wide snapshots and own no rows, so a public-dashboard anonymous
visitor — `role: "viewer"`, `userId: null`, `isAuthenticated: false` —
is a legitimate caller, exactly as they are on Radar and Scans.

`alert-activity` needs more, and **gets it without failing the
request**:

```ts
const user = hasRole(session, "analyst") && session.userId !== null ? session : null;
```

Alert events require `analyst`: `listEventsForSession` calls
`requireUser(options.session, "analyst")`
(`src/lib/services/alertService.ts:404`), and
[ALERTS.md](ALERTS.md) states it. Insights does not lower that bar and
does not raise the whole request to meet it. A viewer asking what
changed in the market gets the seven market sections and one line
explaining the eighth, which is a better answer than a 403 for a page
that is mostly market content.

When the section is computed, the query filters on `user.userId` in the
repository, never in the service and never in React. One user's alert
events cannot reach another user's response, and that is a required
test; see [Tests](#tests).

```text
401  anonymous with the public dashboard off
403  signed-in but below viewer
```

No role below `viewer` exists today, so the 403 path is unreachable in
practice; the access test still pins it, so that adding a lower role
later fails loudly here instead of silently widening the page.

Symbol reach goes through `validateSymbolAccess(symbol, session)`
(`src/lib/services/apiValidation.ts:87`), which is `requireRole` plus
`canAccessSymbol`. A symbol outside the session's `accessibleSymbols` is
a 400 rather than an empty window, so Insights cannot be used to probe
whether a symbol the session may not read has stored history.

## Layers

Stated against the layer rules in [CONTRIBUTING.md](../CONTRIBUTING.md).

**Service** — `src/lib/services/insights/`, split the way
`src/lib/services/situationOverview/` is:

```text
insights.types.ts    every type, no logic
insights.rules.ts    pure aggregation and every template string
insights.service.ts  access, the two repository reads, assembly
```

The split is the point. `insights.rules.ts` imports no database client,
no session type and no clock, so the whole template table is testable on
fixed rows with exact expected text, the way indicators and widgets are.
`insights.service.ts` is the only file that knows a database exists.

**Route** — `src/app/api/insights/route.ts` with `runtime = "nodejs"`.
It reads the session with `getSessionFromRequest`, validates the three
parameters, calls one service function, returns `okJson(...)`, and wraps
the handler in `try`/`catch` with `apiErrorJson`. No aggregation, no
template, no repository import.

**Repositories** — two additive read functions, below. No aggregation in
SQL: no `GROUP BY`, no `COUNT`, no window function. The repository
returns rows; the pure layer counts them. Pushing the counting into SQL
would put the feature's rules somewhere the rules test cannot reach.

**Components** — render `section.title`, `section.coverage` and
`line.text`. **No component composes a sentence**, pluralises a noun,
formats a duration or joins a list. If a string is missing from the UI,
it is missing from `insights.rules.ts`, and that is where it is added.

**Widgets, indicators, collectors** — unchanged. Nothing learns that
Insights is running.

## Storage

**None of its own.** No new table, no new column, no index, no
`schema.ts` change, and therefore no database reset and no
`assertCompatibleSchema` clause. The implementing pull request does not
touch `src/lib/db/schema.ts`.

**It writes nothing at all.** Not a snapshot, not an alert event, not a
collection run, not a cache entry. This is the difference from
[Scans](SCANS.md), which inherits `getSituationOverview`'s snapshot-write
side effect; Insights never calls it. Opening the Insights page twice
leaves every table byte-identical, and that is a test.

### The two repository read functions

Both are additive reads on existing tables, in the existing style —
named filters, newest-first, an explicit `limit` default.

```ts
// src/lib/db/repositories/situationOverviewRepository.ts
listSituationOverviewsInRange(
  db: Database.Database,
  filters: { symbol: string; timeframe: string; from: string; to: string; limit?: number }
): SituationOverviewRecord[]
```

```sql
SELECT * FROM situation_overviews
WHERE symbol = @symbol
  AND timeframe = @timeframe
  AND generated_at >= @from
  AND generated_at <= @to
ORDER BY generated_at DESC, id DESC
LIMIT @limit
```

```ts
// src/lib/db/repositories/alertRepository.ts
listAlertEventsInRange(
  db: Database.Database,
  filters: { userId: number; from: string; to: string; limit?: number }
): AlertEventRecord[]
```

```sql
SELECT * FROM alert_events
WHERE user_id = @userId
  AND created_at >= @from
  AND created_at <= @to
ORDER BY created_at DESC, id DESC
LIMIT @limit
```

Both sit beside the existing filtered reads —
`listSituationOverviewHistory`
(`src/lib/db/repositories/situationOverviewRepository.ts:119`) filters
symbol, timeframe and limit only, and `listAlertEvents`
(`src/lib/db/repositories/alertRepository.ts:276`) filters userId,
acknowledged and limit only, so neither can express a window. Adding a
range parameter to the existing two would change the shape of calls that
have no window, so these are new functions rather than widened ones.

`from` and `to` are already-formatted strings, per table, per
[Two Things The Stored Timestamps Get Wrong](#two-things-the-stored-timestamps-get-wrong).
The repository does no formatting and takes no `Date`; that keeps the
one place that knows about the two formats in `insights.service.ts`.

Both return newest-first because every other list function in these
repositories does. `insights.service.ts` reverses the snapshots to
oldest-first before handing them to the pure layer, and that reversal is
the one place the order flips.

### The index that is not being added

`idx_situation_overviews_symbol_timeframe_generated`
(`src/lib/db/schema.ts:277-278`) is
`(symbol, timeframe, generated_at)` and covers the snapshot read
exactly: two equalities then a range on the third column.

The alert read is not as well served. `idx_alert_events_user_ack_created`
(`src/lib/db/schema.ts:286-287`) is
`(user_id, acknowledged_at, created_at)`, and `acknowledged_at` sits
between the equality and the range, so a query filtering `user_id` and a
`created_at` range uses only the `user_id` prefix and filters the rest
by row. An index on `(user_id, created_at)` would cover it.

**It is deliberately not part of this feature.** It is a `schema.ts`
change — additive, so it would appear on an existing database by itself
since `runMigrations` (`src/lib/db/migrations.ts:59`) execs `schemaSql`
on every start, but a `schema.ts` change all the same — in service of a
read already bounded at 500 rows over one user's own events on a
single-file local SQLite database. It belongs in its own pull request,
raised when a real instance shows the read costing something, not
speculatively in the one that introduces the read.

## Validation

Everything is reused from `src/lib/services/apiValidation.ts`. No new
helper.

- `ApiInputError` — carries the status code `apiErrorJson` returns.
- `validateSymbol(symbol)` (`:27`) then
  `validateSymbolAccess(symbol, session)` (`:87`). Both: the first
  rejects an inactive or unknown symbol, the second rejects one this
  session may not read, and neither alone covers both.
- `validateCollectionTimeframe(timeframe)` (`:52`).
- `validateOptionalRange(range)` (`:62`) — allows `1d`, `7d`, `30d`,
  `90d`, exactly as the skeleton intended, and is reused unchanged.

### Not `validateOptionalTimeframe`

`validateOptionalTimeframe` (`:38`) checks against `appConfig.timeframes`,
which is `defaultTimeframes` — the four collected ones **plus** the
derived `7d`, `30d` and `90d` (`src/lib/config/timeframes.ts:1-3`).
Those three are chart ranges computed over daily candles, not collected
timeframes, and no `situation_overviews` row is ever keyed to one. So
`?timeframe=30d` would pass that validator and return a permanently
empty window that looks like a collection gap.

`validateCollectionTimeframe` restricts to `15m`, `1h`, `4h`, `1d` and
is the right check. This is the same correction [SCANS.md](SCANS.md)
made for the same reason; `src/app/api/overview/situation/history/route.ts:24`
is the existing call that still uses the looser one.

### The `range` and `timeframe` vocabulary collision

The two parameters share three tokens and mean different things:

```text
timeframe   15m  1h  4h  1d              the candle interval a snapshot is keyed to
range       1d   7d  30d  90d            how far back this request looks
```

`1d` is valid in both and means the daily candle interval in one and a
twenty-four-hour lookback in the other. `7d`, `30d` and `90d` are valid
ranges and **invalid timeframes**, which is the trap: `?timeframe=7d` is
a 400, `?range=7d` is the default.

Nothing is renamed to avoid this — `range` is already the app's word in
`validateOptionalRange` and on the chart controls, and `timeframe` is
already the app's word everywhere else. What is required is that the
error names the parameter, which `validateCollectionTimeframe` does:
`Unsupported timeframe: 7d`. The UI keeps the two controls visually
separate and labelled, and the page never offers `7d` in the timeframe
control.

## API

One route.

```text
GET /api/insights?symbol=BTCUSDT&timeframe=1h&range=7d
```

### Request parameters

```text
symbol     optional. Default: defaultSituationSymbol(). Must be an
           active configured symbol the session may read.
timeframe  optional. Default: defaultSituationTimeframe(). Must be one
           of the four collectionTimeframes.
range      optional, "1d" | "7d" | "30d" | "90d". Default "7d".
```

`defaultSituationSymbol` and `defaultSituationTimeframe`
(`src/lib/services/situationOverview/situationOverview.service.ts:242-247`)
are reused so Insights opens on the same pair the dashboard does.

### Response

Under the `okJson` `{ status, data }` wrapper, so clients read
`json.data`. Trimmed to three sections here; the real response always
carries all eight.

```jsonc
{
  "status": "ok",
  "data": {
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "range": "7d",
    "requestedWindow": {
      "from": "2026-09-12T11:04:00.000Z",
      "to": "2026-09-19T11:04:00.000Z"
    },
    "coveredWindow": {
      "from": "2026-09-14T08:00:00.000Z",
      "to": "2026-09-19T11:01:12.000Z"
    },
    "snapshotCount": 14,
    "truncated": false,
    "generatedAt": "2026-09-19T11:04:00.000Z",
    "sections": [
      {
        "id": "window-coverage",
        "title": "Window coverage",
        "category": "market",
        "coverage": "reported",
        "lines": [
          {
            "id": "window-snapshots",
            "text": "14 situation snapshots cover the requested 7d window.",
            "values": { "snapshotCount": 14, "range": "7d" },
            // abridged; the real line carries all 14 snapshot ids
            "sourceRows": [
              { "table": "situation_overviews", "ids": [811, 814, 817] }
            ]
          },
          {
            "id": "window-span",
            "text": "The covered span runs 2026-09-14T08:00:00.000Z to 2026-09-19T11:01:12.000Z, narrower than the requested 7d window.",
            "values": {
              "from": "2026-09-14T08:00:00.000Z",
              "to": "2026-09-19T11:01:12.000Z",
              "range": "7d"
            },
            "sourceRows": [
              { "table": "situation_overviews", "ids": [811, 903] }
            ]
          },
          {
            "id": "window-gap",
            "text": "The largest gap between consecutive snapshots is 2 days 3 hours.",
            "values": { "gapMs": 183600000 },
            "sourceRows": [
              { "table": "situation_overviews", "ids": [824, 831] }
            ]
          }
        ]
      },
      {
        "id": "bias-transitions",
        "title": "Bias transitions",
        "category": "market",
        "coverage": "reported",
        "lines": [
          {
            "id": "bias-transition-824-831",
            "text": "Bias moved from bullish to neutral at 2026-09-17T09:30:00.000Z, 2 days 3 hours after the previous snapshot.",
            "values": {
              "previous": "bullish",
              "current": "neutral",
              "at": "2026-09-17T09:30:00.000Z",
              "gapMs": 183600000
            },
            "sourceRows": [
              { "table": "situation_overviews", "ids": [824, 831] }
            ]
          }
        ]
      },
      {
        "id": "alert-activity",
        "title": "Alert activity",
        "category": "personal",
        "coverage": "omitted",
        "lines": [
          {
            "id": "alerts-omitted",
            "text": "Alert activity is personal to a signed-in account with the analyst role, so it is not included in this response.",
            "values": {},
            "sourceRows": []
          }
        ]
      }
    ]
  }
}
```

`coveredWindow` is `null` when the window holds no snapshot.
`snapshotCount` is the number of rows read, after any truncation.
`generatedAt` is `now.toISOString()` — when the response was assembled,
not when anything in it happened.

`sourceRows` is the traceability the intro promises, and it is per line,
not per section. A line with nothing behind it — `alerts-omitted` — has
an empty array rather than a missing key.

### Status codes

```text
200  the window was read, including when it held no snapshot and
     including when alert-activity came back omitted
400  unknown or inaccessible symbol
     timeframe outside collectionTimeframes, which includes 7d, 30d
       and 90d
     range outside 1d / 7d / 30d / 90d
401  anonymous with the public dashboard off
403  signed-in but below viewer
```

There is no 404. A pair with no stored snapshot is a 200 with an empty
window, because an uncollected pair is a collection gap and not a bad
request.

### Curl

```bash
curl --get http://localhost:3000/api/insights \
  --data-urlencode 'symbol=BTCUSDT' \
  --data-urlencode 'timeframe=1h' \
  --data-urlencode 'range=7d'

curl --get http://localhost:3000/api/insights \
  --data-urlencode 'symbol=ETHUSDT' \
  --data-urlencode 'timeframe=4h' \
  --data-urlencode 'range=30d'
```

## Service Signatures

Two exported functions. One is pure; the other is the only one that
touches a database.

```ts
buildInsightSections(input: BuildInsightSectionsInput): InsightSection[]

getInsights(options: {
  session: AuthSession;
  symbol?: string;
  timeframe?: string;
  range?: InsightRange;
  db?: Database.Database;
  now?: Date;
}): InsightsResponse
```

`buildInsightSections` is **pure**: rows in, sections out. No database,
no session, no clock, no `Date.now()`, no catalog lookup beyond the
module-constant one named in
[Rules that hold across sections](#rules-that-hold-across-sections). It
receives the truncation flags rather than computing them, so every
over-cap template is testable without seeding five thousand rows.

`getInsights` is **synchronous** and returns a plain value, not a
promise. It reads two tables with prepared statements and composes; no
call in its path is async, and adding an `await` would be the first step
toward putting a fetch in a window read. It **writes nothing**.

The optional `db` follows every other service, so tests pass an
in-memory database. When `db` is absent, `initializeDatabase()` then
`getDatabase()`, as
`src/lib/services/situationOverview/situationOverview.service.ts:151-155`
does.

### Types

Declared in `src/lib/services/insights/insights.types.ts` and
re-exported from `src/lib/api/types.ts` beside the Scans and Watchlist
API types.

```ts
type InsightRange = "1d" | "7d" | "30d" | "90d";

type InsightSectionId =
  | "window-coverage"
  | "bias-transitions"
  | "risk-transitions"
  | "recurring-drivers"
  | "persistent-conflicts"
  | "watch-conditions"
  | "data-coverage"
  | "alert-activity";

type InsightSectionCategory = "market" | "personal";

type InsightSectionCoverage = "reported" | "insufficient" | "empty" | "omitted";

interface InsightWindow {
  from: string;
  to: string;
}

interface InsightSourceRows {
  table: "situation_overviews" | "alert_events";
  ids: number[];
}

interface InsightLine {
  id: string;
  text: string;
  values: Record<string, string | number>;
  sourceRows: InsightSourceRows[];
}

interface InsightSection {
  id: InsightSectionId;
  title: string;
  category: InsightSectionCategory;
  coverage: InsightSectionCoverage;
  lines: InsightLine[];
}

interface InsightsResponse {
  symbol: string;
  timeframe: string;
  range: InsightRange;
  requestedWindow: InsightWindow;
  coveredWindow: InsightWindow | null;
  snapshotCount: number;
  truncated: boolean;
  generatedAt: string;
  sections: InsightSection[];
}
```

The two row shapes the pure layer consumes. Both are narrower than the
stored record on purpose: a field that reaches `buildInsightSections` is
a field some section reads, and
[What it deliberately does not read](#what-it-deliberately-does-not-read)
explains every omission.

```ts
interface InsightSnapshot {
  id: number;
  generatedAt: string;
  bias: SituationBias;
  riskLevel: SituationRiskLevel;
  confidence: SituationConfidence;
  mainDrivers: SituationDriver[];
  conflictingSignals: SituationDriver[];
  watchConditions: SituationWatchCondition[];
  meta: {
    missingInputs: string[];
    staleInputs: string[];
    usedFallbacks: string[];
    isPartial: boolean;
  };
}

interface InsightAlertEvent {
  id: number;
  createdAt: string;
  severity: AlertSeverity;
  title: string;
  symbol: string;
  timeframe: string;
  acknowledged: boolean;
}

interface BuildInsightSectionsInput {
  range: InsightRange;
  requestedWindow: InsightWindow;
  snapshots: InsightSnapshot[];
  snapshotsTruncated: boolean;
  snapshotsLeftOut: number;
  alerts: InsightAlertEvent[] | null;
  alertsTruncated: boolean;
  alertsLeftOut: number;
}
```

`snapshots` arrives **oldest-first**; the service reverses the
newest-first repository result once, and the pure layer never sorts by
time again. `alerts` is `null` when `alert-activity` is omitted and `[]`
when the section is available and the window held no event — the two are
different answers and a single empty array could not tell them apart.

`insights.service.ts` owns the parsing from `SituationOverviewRecord` to
`InsightSnapshot`, with the same defensive `parseJson<T>(value,
fallback)` shape
`src/lib/services/situationOverview/situationOverview.service.ts:48-54`
uses: a row whose JSON will not parse contributes an empty list rather
than throwing, so one bad row does not take the window with it. Its
`bias`, `riskLevel` and `confidence` columns are `TEXT` in the database
and are cast to their union types on the way through; an unrecognised
value flows into the text as itself rather than being dropped, which is
what makes an old row readable instead of invisible.

`createdAt` on `InsightAlertEvent` has already been through
`toIsoTimestamp`, and `acknowledged` is `acknowledgedAt !== null`
resolved in the service, so the pure layer never sees a nullable
timestamp it might try to parse.

## UI

`/insights` is a guarded page:

```tsx
export default async function InsightsPage() {
  const session = await requirePageSession("/insights");

  return (
    <SessionProvider session={session}>
      <InsightsFoundation />
    </SessionProvider>
  );
}
```

The default `minimumRole: "viewer"` and **no** `signedIn: true`. Seven
of the eight sections are instance-wide market content, so the page has
something real to show an anonymous visitor when the public dashboard is
on. The shape follows `src/app/scans/page.tsx` and `src/app/radar/page.tsx`
— a server guard wrapping `SessionProvider` around a client foundation
component.

`requirePageSession` goes through `pageInstanceStatus()`, which awaits
`connection()` (`src/lib/auth/pageGuard.ts:14`). Without that the route
is prerendered as a static redirect to `/setup` and a built instance is
permanently broken, so the route must appear as `ƒ` and not `○` in
`next build` output. Check the build output before the pull request.

### Shell

`AppShell`'s `activeItem` union
(`src/components/dashboard/primitives.tsx:408`) gains `"insights"`, and
the nav item at `src/components/dashboard/primitives.tsx:423` loses
`disabled: true` and gains `active: activeItem === "insights"` and an
`onClick` pushing `/insights`. It keeps its `Sparkles` icon.

It takes **no** `hidden`, matching Radar and Scans. The page is open to
everyone the guard lets through, including the public-dashboard
anonymous visitor, and the one section they cannot have explains itself
in place rather than removing the page from their navigation.

### Foundation component

`src/components/insights/InsightsFoundation.tsx`, following
`src/components/radar/OpportunityRadarFoundation.tsx` and
`src/components/scans/ScansFoundation.tsx`:

- a symbol control whose options come from `GET /api/symbols`, a
  timeframe control over `collectionTimeframes`, and a range control
  over the four `validateOptionalRange` values — none of the three
  hardcoded in the component. The Radar foundation's module-level
  `symbols` / `timeframes` constants
  (`src/components/radar/OpportunityRadarFoundation.tsx:28-29`) are a
  precedent not to copy.
- a window header showing `requestedWindow`, `coveredWindow` and
  `snapshotCount`, so the difference between what was asked for and what
  exists is visible without opening a section
- one `GlassPanel` per section, in the order received, each with its
  `title`, a `StatusBadge` carrying its `coverage`, and its lines
- each line rendered as `line.text`, with `values` and `sourceRows`
  available for a detail affordance and never used to build a sentence
- `GlassCard`, `GlassPanel`, `StatusBadge`, `MetricPill` and
  `EmptyState` from `src/components/dashboard/primitives.tsx`, reused
  rather than restyled

Changing any control re-issues one `GET /api/insights` and replaces the
sections. The component never merges two responses, never caches a
previous window's sections alongside a new one's, and never filters or
reorders `sections` or `lines`.

Dates inside a line render through `replaceIsoDatesWithLocalTime` from
`src/lib/utils/formatDateTime`, which rewrites every ISO string in a
block of text to the viewer's local time. That works only because the
service normalises alert timestamps to ISO first — the raw
`2026-09-19 11:01:12` form does not match the pattern
`src/lib/utils/formatDateTime.ts:1` looks for and would render as stored
UTC with no indication of it.

### States

Each is a state the implementation must render, and the E2E and manual
passes walk them:

| State | What renders |
| --- | --- |
| Loading | The controls stay enabled and the previous sections stay on screen rather than blanking |
| Reported | Eight panels in order, each with its coverage badge and its lines |
| Insufficient window | The six snapshot sections show their `insufficient` line; `window-coverage` leads with the count and the shortfall |
| Empty window | `window-coverage` states that nothing was stored; the six snapshot sections show their `empty` line; an `EmptyState` above them points at collection |
| Alert activity omitted | The eighth panel renders with a muted badge and its one line, in place, not hidden |
| Truncated | The `window-truncated` line renders with the rest; nothing about the panel is special-cased |
| Range change | The controls stay usable during the request and the window header updates with the response |
| Load error | An error panel with the message and a retry that re-issues the same request |
| Invalid parameter | The 400 message renders inline beside the controls; the previous sections are left intact |
| Anonymous, public dashboard off | The page never renders; the guard redirects to `/login?next=%2Finsights` |

Nothing on the page ranks a section, scores a line, or phrases anything
as something to do.

## Tests

By file and by case.

**`test:services` — `src/lib/services/insights/insights.rules.test.ts`**

Fixed `InsightSnapshot` arrays in, exact expected `text` out. This file
is where the template table is pinned, and every case asserts the full
string, not a substring.

- `window-coverage` at 0, 1, 2 and 14 snapshots: the four
  `window-snapshots` variants, `window-span` in both its forms,
  `window-gap`, and `window-insufficient` at 1 and at 2
- `window-truncated` with `snapshotsTruncated: true` and
  `snapshotsLeftOut: 412`
- coverage values: 0 snapshots gives the six snapshot sections `empty`
  and `window-coverage` `reported`; 2 gives them `insufficient`; 3 gives
  them `reported`
- `bias-transitions` over a fixed series with two transitions, asserting
  both lines, their ids, their `values` and their `sourceRows`, in
  oldest-first order
- `bias-steady` on a constant series, including a constant `unknown`
- `bias-truncated`: 27 transitions produce 20 lines plus the left-out
  line, and the 20 are the most recent
- `risk-transitions` mirrors all four bias cases
- `formatDuration` through the transition text at each boundary: 59s,
  60s, 59m, 60m, 23h 59m, 24h, exactly 1 day, 2 days 3 hours
- `recurring-drivers`: the two-appearance floor drops a one-appearance
  driver; `holding` versus `moving from … to …`; the label comes from
  the most recent appearance when two snapshots labelled the same widget
  differently; ordering by count, then recency, then key; the
  `drivers-none` and `drivers-no-recurrence` variants; the cap and its
  left-out line
- `persistent-conflicts` mirrors the driver cases
- `watch-conditions`: a single appearance is listed; grouping is by
  condition `id` and not by `sourceWidget`, proven with two conditions
  from one widget; severity is the highest reached across appearances;
  severity leads the ordering, so a one-appearance `critical` outranks a
  seven-appearance `info`; `watch-none`; the cap
- `data-coverage`: `coverage-partial` at 0, 1 and 6; `coverage-stale`
  and `coverage-missing` in both their forms, including the
  seven-widget case that appends `and 3 others`; `coverage-confidence`
  constant and varying, asserting the fixed `high, medium, low` order
  and that a zero count is omitted
- `joinWithAnd` through the text at one, two and three items
- `alert-activity`: `alerts: null` gives `omitted` with the one line;
  `alerts: []` gives `empty`; a populated array gives the count line,
  the group lines in severity-then-count order, and the
  acknowledgement line in all three of its forms; `alerts-truncated`;
  `alerts-groups-truncated`
- every section appears in the output at its fixed index, in every one
  of the cases above
- determinism: the same input built twice produces deeply equal output

**`test:services` — `src/lib/services/insights/insights.service.test.ts`**

On a seeded in-memory database, with a fixed `now`.

- the window bound sent to each repository is formatted for that table:
  ISO for `situation_overviews`, `YYYY-MM-DD HH:MM:SS` for
  `alert_events`
- a snapshot whose `generated_at` equals `requestedWindow.from` exactly
  is included; one a second earlier is excluded; the same at the upper
  bound
- an alert event stored through the `datetime('now')` default falls
  inside the window and its `createdAt` comes back as an ISO string
  ending in `Z`, with the same instant it was stored at — the local-time
  parse would shift it and the assertion catches that
- snapshots reach `buildInsightSections` oldest-first
- a row with unparseable `main_drivers_json` contributes no driver and
  does not throw, and the rest of the window still reports
- `coveredWindow` is `null` on an empty window and the oldest and newest
  stored `generated_at` otherwise
- the repository is called with `maxSnapshotsPerWindow` and
  `maxAlertEventsPerWindow` as its `limit`
- a `viewer` session gets `alert-activity` with `coverage: "omitted"`
  and the request still returns 200 with the seven market sections
  populated
- an `analyst` session gets `alert-activity` computed from its own
  events
- **two users, one database**: user A's alert events never appear in
  user B's response, in `lines`, in `values` or in `sourceRows`
- the public-dashboard anonymous session — `role: "viewer"`,
  `userId: null` — gets the market sections and the omitted eighth
- `getInsights` writes nothing: the row counts of
  `situation_overviews`, `alert_events` and `widget_results` are
  identical before and after two calls, and the stored rows are
  unchanged
- `getInsights` returns a value rather than a promise
- a symbol outside `accessibleSymbols` throws `ApiInputError` with
  status 400 rather than returning an empty window

**`test:db` — `src/lib/db/repositories/situationOverviewRepository.test.ts`**

- `listSituationOverviewsInRange` returns rows at both bounds inclusive
  and excludes rows one millisecond outside
- it filters by symbol and timeframe, proven with a second pair seeded
  inside the same window
- it orders newest-first and applies `limit` by dropping the oldest

**`test:db` — `src/lib/db/repositories/alertRepository.test.ts`**

- `listAlertEventsInRange` matches rows stored by the `datetime('now')`
  column default against a `YYYY-MM-DD HH:MM:SS` bound, at both ends
- it returns only the given `user_id`'s rows, with a second user seeded
  inside the same window
- it orders newest-first and applies `limit` by dropping the oldest

**`test:auth` — `src/lib/auth/access.test.ts`**

- anonymous with the public dashboard off against a `viewer`
  requirement: 401
- a signed-in session below `viewer`: 403
- the public-dashboard anonymous viewer passes
  `requireRole(session, "viewer")`, which is what lets the market
  sections render for them
- that same session fails `requireUser(session, "analyst")`, which is
  what makes `alert-activity` omitted rather than a 403 on the request

**`test:e2e` — `tests/e2e/insights.spec.ts`**

- the sidebar item is enabled and navigates — through the `<aside>` on
  `chromium-desktop` and the drawer below `lg`, as
  `tests/e2e/navigation.spec.ts` does
- the reported state renders all eight panels with their coverage badges
- changing the range re-issues the request and replaces the sections
- the insufficient window shows the count and the shortfall
- the empty window shows the collection `EmptyState`
- `alert-activity` renders its omitted line in place for a viewer

All six run on the three configured viewports. `/api/insights` is mocked
from a `tests/e2e/insights.fixtures.ts` module the way
`tests/e2e/scans.fixtures.ts` mocks `/api/scans/run`: the first-run E2E
database has no situation snapshots at all, so an unmocked page could
only ever exercise the empty-window state, and the reported, insufficient
and omitted cases each need a payload the suite controls.

### What the implementing pull request runs

Per the definition of done: `npm run lint`, `npm run typecheck`, the
eight unit test scripts, `npm run build` — `/insights` is a guarded
page, so check it shows as `ƒ` — and `npm run test:e2e`, because this
adds a UI flow. It also updates `docs/architecture.md` with the new
route, and `docs/auth.md` with the `alert-activity` role rule.

## Guardrails

- No model, no generated wording, no paraphrase. Every string a user
  reads comes from the template table in this document, and a new
  sentence is a change to this document first.
- No aggregation in SQL and none in React. The repository returns rows,
  `insights.rules.ts` counts them, the component renders `line.text`.
- No write. Not a snapshot, not an alert event, not a cache. Insights
  never calls `getSituationOverview` and never touches `widget_results`.
- No cross-table timestamp comparison, and no `new Date()` on a value
  from `alert_events.created_at` before `toIsoTimestamp` has run.
- No widening of the alert rule. `alert-activity` needs `analyst` and a
  signed-in user, and is omitted rather than broadened.
- No bypass of symbol access. Every request goes through
  `validateSymbolAccess`.
- No new collector, widget, indicator, external data source, queue,
  worker, cache or scheduled job.
- No cap applied silently. Every truncation states how many entries it
  left out.
- Nothing rendered or returned is phrased as a prediction, a
  recommendation, an entry, an exit, a price target or a position size.

## Open Questions

### Resolved from the skeleton

- **"What does a sparse window report?"** — Resolved.
  `minimumSnapshots = 3`. Zero rows give the six snapshot sections
  `coverage: "empty"`; one or two give `"insufficient"` with the count;
  three or more give `"reported"`. `window-coverage` reports at every
  count, because it is the section that states the shortage. A sparse
  window therefore reports its sparseness as its finding, which is a
  true answer, rather than an aggregation over too few rows.
- **"Is there a minimum row count below which Insights declines to
  summarize?"** — Resolved, and it is the same threshold. Two snapshots
  hold one interval, and one interval is not a transition record or a
  recurrence. Below three the sections name the count and stop; they do
  not partially aggregate. The threshold is a named constant in
  `insights.rules.ts` so the rules test can assert against the name
  rather than the number.

### For the maintainer

- **`alert_events.created_at` renders as local time on the Alerts
  page.** `src/components/alerts/AlertsFoundation.tsx:417` passes
  `event.createdAt` to `formatLocalDateTime`, which calls
  `new Date(value)` on the stored `2026-09-19 11:01:12`. With no zone
  marker that parses as **local** time, so on any instance not running
  in UTC every alert timestamp on that page is off by the host's offset.
  This is pre-existing and outside this feature — Insights normalises
  its own reads with `toIsoTimestamp` — but it is the same bug in the
  same column, and whether to fix it here, in a separate pull request,
  or by normalising in `toEventApi`
  (`src/lib/services/alertService.ts:117`) so every consumer gets ISO,
  is the maintainer's call. Normalising in `toEventApi` would fix the
  Alerts page and let Insights drop its own call, at the cost of
  changing an existing API response's string format.
- **Nothing keeps `situation_overviews` populated.** A row is written
  only when someone opens a page that builds an overview and the state
  materially changed or fifteen minutes have passed
  (`shouldPersistOverview`,
  `src/lib/services/situationOverview/situationOverview.service.ts:104-124`).
  So a window's density depends on who visited the dashboard and when,
  and a quiet week produces a thin window that Insights honestly reports
  as thin. Having the existing scheduler refresh situation overviews on
  its interval would make a window depend on the instance rather than on
  its visitors. That is a change to collection behaviour, not to
  Insights, and it needs the maintainer's yes.
- **A multi-pair Insights view over the watchlist.** Everything here is
  one symbol and one timeframe. Running the same eight sections across a
  user's `watchlist_items` and stacking them is a natural follow-on, and
  it is user-owned data, so it would need the isolation rule
  [WATCHLIST.md](WATCHLIST.md) already carries. Out of scope as
  specified; worth deciding before the UI settles, since a page built
  for one pair is awkward to widen later.
- **The `(user_id, created_at)` index on `alert_events`**, described
  under [The index that is not being added](#the-index-that-is-not-being-added).
  Deliberately not part of this feature. Worth adding when a real
  instance shows the windowed alert read costing something.
