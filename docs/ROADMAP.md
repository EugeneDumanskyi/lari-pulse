# Roadmap

What is planned and not yet built. Each feature below links a skeleton
specification that can be expanded and then implemented through normal
pull requests. Nothing is implemented until a pull request lands and
moves a capability out of that spec's `Not implemented:` list.

Build order: the dead mock UI cleanup comes first because every new page
inherits the missing navigation below `lg`; Watchlist comes next because
it sits closest to the existing portfolio and alert plumbing, and the
three stateless features follow it.

## 1. Dead mock UI cleanup

`TopBar`, `SymbolTabs`, `StaleWarning` and `LoadingToast` are exported
from `src/components/dashboard/primitives.tsx` and imported nowhere in
`src/`: remove them, and decide what real navigation below the `lg`
breakpoint should be, because the sidebar is `hidden … lg:flex` and the
only menu button lives inside the unrendered `TopBar`, so there is no
navigation at all on the mobile and tablet viewports the Playwright
suite runs. No spec file; one pull request.

## 2. Watchlist

One place to keep the symbol and timeframe pairs a user follows, showing
each pair's existing deterministic state side by side. Minimum role:
signed-in `viewer`, which makes it the first user-owned data available
below `analyst`. Adds one user-owned table, `watchlist_items`, so
landing it needs a local database reset.

Specified in full: columns and types, the four route payloads with their
status codes, repository and service signatures, the UI states including
empty and error, and the test cases by name. Ordering is manual through
an explicit `position` column, symbols are the active Binance pairs only,
and `portfolio_items` is untouched. It can be implemented without further
design work.

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
