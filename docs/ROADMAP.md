# Roadmap

What is planned and not yet built. Each feature below links a skeleton
specification that can be expanded and then implemented through normal
pull requests. Nothing is implemented until a pull request lands and
moves a capability out of that spec's `Not implemented:` list.

Build order: Watchlist has landed, having sat closest to the existing
portfolio and alert plumbing. The dead mock UI cleanup is next and still
open — every page, Watchlist included, inherits the missing navigation
below `lg` — and the three stateless features follow it.

## 1. Dead mock UI cleanup

`TopBar`, `SymbolTabs`, `StaleWarning` and `LoadingToast` are exported
from `src/components/dashboard/primitives.tsx` and imported nowhere in
`src/`: remove them, and decide what real navigation below the `lg`
breakpoint should be, because the sidebar is `hidden … lg:flex` and the
only menu button lives inside the unrendered `TopBar`, so there is no
navigation at all on the mobile and tablet viewports the Playwright
suite runs. No spec file; one pull request.

## 2. Watchlist — landed

One place to keep the symbol and timeframe pairs a user follows, showing
each pair's existing deterministic state side by side. Minimum role:
signed-in `viewer`, which makes it the first user-owned data available
below `analyst`. It adds one user-owned table, `watchlist_items`, which
needed no database reset: `schemaSql` runs as `CREATE TABLE IF NOT
EXISTS` on every start, so a purely additive table appears on an existing
database by itself. Only a change to an existing table's shape needs the
delete-and-`npm run db:init` dance.

Ordering is manual through an explicit `position` column, symbols are the
active Binance pairs only, timeframes are the four collected ones, and
`portfolio_items` is untouched.

See [WATCHLIST.md](WATCHLIST.md).

## 3. Scans

Runs an explicit, user-stated filter across the configured symbols and
timeframes and returns the pairs whose stored deterministic state
matches, naming the conditions that matched. Complements
[Opportunity Radar](OPPORTUNITY_RADAR.md) rather than replacing it.
Minimum role: `viewer`. Adds no table; it reads stored results.

See [SCANS.md](SCANS.md).

## 4. Insights

A deterministic read of what changed across a window, assembled from
already persisted snapshots: bias and risk transitions, recurring
drivers, persistent conflicts and the alert events raised. Minimum role:
`viewer` for instance-wide content, with user-owned sections filtered by
the signed-in user. Adds no table.

See [INSIGHTS.md](INSIGHTS.md).

## 5. Reports

Renders a chosen window of stored state into one self-contained document
in a plain local format the user can keep or hand to someone. Minimum
role: `viewer` for market sections, `analyst` for sections drawing on
portfolio or alert data. Adds no table.

See [REPORTS.md](REPORTS.md).
