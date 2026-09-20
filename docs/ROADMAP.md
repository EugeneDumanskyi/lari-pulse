# Roadmap

What is planned and not yet built. Each feature below links a skeleton
specification that can be expanded and then implemented through normal
pull requests. Nothing is implemented until a pull request lands and
moves a capability out of that spec's `Not implemented:` list.

Build order: Watchlist has landed, having sat closest to the existing
portfolio and alert plumbing, and the dead mock UI cleanup has followed
it, so every page now has navigation below `lg`. The three stateless
features come next and are independent of each other.

## 1. Dead mock UI cleanup — landed

`TopBar`, `SymbolTabs`, `StaleWarning` and `LoadingToast` were exported
from `src/components/dashboard/primitives.tsx` and imported nowhere, and
removing `SymbolTabs` orphaned `ToolbarButton`, so all five are gone.

Navigation below `lg` is a drawer in `AppShell`: the sidebar stays
`hidden … lg:flex`, and under it a header bar carries the logo and an
`Open navigation` button that opens the same nav list and account panel,
both now shared between the two rather than duplicated. It closes on
navigation, on the backdrop and on Escape.

The same pass made the existing chrome actually work. The glass surfaces
are tuned in one-percent steps — `text-white/62`, `border-white/12`,
`bg-slate-950/42` — but Tailwind's stock opacity scale only goes in
fives, so about ninety utilities across the app silently generated
nothing: text fell back to the inherited colour, borders to the
near-white default and, worst, form fields lost their background and
rendered the user agent's white behind `text-white`, which made every
input on Portfolio and Watchlist unreadable. `tailwind.config.ts` now
carries whole percents, `:root` declares `color-scheme: dark` so native
controls follow, and the two `text-current/8x` classes — an alpha on
`currentColor`, which Tailwind cannot express — became `opacity-8x`.

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
