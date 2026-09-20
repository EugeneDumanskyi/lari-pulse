# Reports

Reports renders a chosen window of stored state into one self-contained
document the user can keep or hand to someone, in a plain local format.

It is not scheduled delivery, not email, not a queue, not a worker
process, and not a performance or returns statement. A report describes
what the stored state said over a window; it never states what will
happen or what to do.

## Scope

Implemented:

- Nothing yet.

Not implemented:

- `src/lib/services/reportService.ts`.
- `GET /api/reports`.
- `/reports` page and the enabled sidebar item.

Out of scope:

- Scheduling, email, webhooks, queues or background workers.
- Returns, performance attribution or any profit and loss statement
  beyond what the portfolio section already computes for its owner.
- New collectors, widgets or external data sources.

## Storage

None. A report is regenerated from the same rows any time, so it needs
no database reset to land.

Persisting report runs is a separate, later addition: a user-owned
`report_runs` table holding `user_id`, the parameters, the generated
body or a path to it, and timestamps, with `ON DELETE CASCADE` and an
index led by `user_id`. Because there are no migrations, adding it would
require deleting `data/laripulse.sqlite` plus `-wal`/`-shm` and running
`npm run db:init`, and the pull request touching `schema.ts` would say
so.

## Access

The role is stated per section, not as one blanket role for the whole
report:

- Market sections — Situation Overview state, widget results, radar
  ranking — require `viewer`, the same reach those surfaces already
  have.
- A portfolio section requires `analyst` and filters by
  `session.userId`.
- An alert section requires `analyst` and filters by `session.userId`.

Anonymous requests for an `analyst` section get 401; a `viewer`
requesting one gets 403. A session may never receive a section it could
not read on its own page.

## Layers

- `reportService` composes existing service output —
  `situationOverview`, `opportunityRadarService`,
  `portfolioContextService` — and owns serialization. It recalculates
  nothing that a service already produces.
- The route validates parameters and streams the result. No composition
  and no serialization in the route handler, none in React.
- No new collector and no new widget.

## API

```text
GET /api/reports?symbols=BTCUSDT&timeframes=1h&range=30d&format=markdown
```

`range` reuses `validateOptionalRange`; symbols and timeframes go
through the existing validation helpers. The report body is returned
under `okJson`, and a download form returns the same body as a local
file with the matching content type.

Output formats are limited to Markdown, JSON and CSV, chosen because
they need no new dependency. PDF or spreadsheet rendering would mean
adding a library, so it is flagged as needing the maintainer's approval
before any work starts.

## UI

A guarded `/reports` page through `requirePageSession`, which uses
`pageInstanceStatus()` and so awaits `connection()`. The route must show
as `ƒ` and not `○` in `next build` output, or the guard is prerendered
as a static redirect to `/setup`. Sections the session cannot read are
not offered in the page controls, and the decision is enforced in the
service, not only in React.

## Tests

- `test:services` — fixed input in, exact serialized output out, per
  format, because serialization is deterministic.
- `test:auth` — the 401 and 403 paths, including that a `viewer` cannot
  obtain the `analyst`-only sections, and that one user's portfolio and
  alert content never reaches another user's report.
- `test:e2e` — generating and downloading a report on the page.

## Open Questions

- Which sections make the default report?
- Is a viewer report and an analyst report one endpoint with the
  unreadable sections omitted, or two endpoints?
- Is generation capped by window length, and if so is the cap a
  validation error or a truncated report that says it was truncated?
