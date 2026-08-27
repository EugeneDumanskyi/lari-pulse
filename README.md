# LariPulse

LariPulse is a self-hosted market intelligence dashboard. It turns public Binance and FRED data into explainable signals. Every widget is a small deterministic engine that returns a score, a direction, a confidence and the reasons behind them, not just a number on a tile.

It runs as a single Next.js app on SQLite. No Redis, no Postgres, no paid APIs, no model-based predictions.

## What it does

- **Crypto signals** for BTC, ETH and SOL on 15m, 1h, 4h and 1d: Trend Strength, Momentum Exhaustion, Support / Resistance Pressure, Volume Confirmation and Multi-Timeframe Alignment.
- **Cross-market context** from FRED daily series (gold, oil, Nasdaq 100, S&P 500, dollar, 10-year yield, VIX): Macro Risk Pulse, Dollar Pressure, Risk-On / Risk-Off Regime, Nasdaq-Crypto Correlation, Cross-Market Divergence and more.
- **Situation Overview**: one read of bias, risk, main drivers, conflicting signals and watch conditions, with changes since the last calculation.
- **Liquidations and derivatives**: observed forced orders from the Binance futures stream, plus funding, open interest, long/short ratio and basis.
- **Opportunity Radar**: ranks markets and timeframes by setup quality and by how much attention they deserve.
- **Chart overlays with reasons**: support/resistance zones, large liquidations and priced watch conditions on the price chart.
- **Alerts and portfolio** for each analyst: in-app alerts on Situation Overview changes, and a private watchlist with P/L and risk context.
- **Multi-user**: first-run setup, admin / analyst / viewer roles, invite links and an optional public read-only dashboard.

## Quickstart

Requires Node.js 20 or newer.

```bash
git clone https://github.com/EugeneDumanskyi/lari-pulse.git
cd lari-pulse
npm install
npm run dev
```

Open http://localhost:3000. A fresh install sends you to `/setup` to create the first admin account.

Then load some data. Sign in as the admin and trigger a collection, or turn on the scheduler (see below):

```bash
# sign in and keep the session cookie
curl -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}' -c cookies.txt

# Binance candles and widget results for all configured symbols and timeframes
curl -b cookies.txt -X POST http://localhost:3000/api/collect/run

# FRED daily series for the cross-market widgets
npm run collect:fred
```

To keep data fresh, set `SCHEDULER_ENABLED=true` in `.env.local` and restart. You can also set `MACRO_SCHEDULER_ENABLED=true` and `LIQUIDITY_RUNTIME_ENABLED=true`.

For production, run `npm run build && npm start` behind a reverse proxy that terminates TLS.

## Users and roles

| Role | Access |
| --- | --- |
| `viewer` | Dashboard, markets, radar, chart overlays, Situation Overview |
| `analyst` | Viewer access plus a private portfolio and private alerts |
| `admin` | Everything, plus users, invites, instance settings, widget visibility and collection runs |

Sign-up is closed by default. Admins invite people from **Settings → Users & Invites** with a one-time link that carries the role. No mail server is needed. Admins can also open sign-up (new accounts become viewers) or make the dashboard readable without an account.

If you forget the admin password, run this on the server:

```bash
npm run user:reset-password -- you@example.com
```

See [docs/auth.md](docs/auth.md) for the full access model, sessions, throttling and the API.

## Configuration

Copy `.env.example` to `.env.local` and change what you need. All variables are optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | `data/laripulse.sqlite` | SQLite file |
| `SCHEDULER_ENABLED` | `false` | Collect Binance candles and recalculate widgets on an interval |
| `COLLECT_INTERVAL_SECONDS` | `60` | Scheduler interval |
| `MACRO_SCHEDULER_ENABLED` | `false` | Also refresh FRED data and cross-market widgets when due |
| `MACRO_REFRESH_INTERVAL_SECONDS` | `86400` | Cross-market refresh interval |
| `LIQUIDITY_RUNTIME_ENABLED` | `false` | Keep the Binance liquidation stream connected |
| `LIQUIDATIONS_RETENTION_HOURS` | `48` | How long observed liquidations are kept |
| `LARIPULSE_SESSION_MAX_AGE_SECONDS` | `2592000` | Session lifetime (30 days) |
| `LARIPULSE_INVITE_MAX_AGE_SECONDS` | `604800` | Invite link lifetime (7 days) |
| `LARIPULSE_ADMIN_EMAIL`, `LARIPULSE_ADMIN_PASSWORD` | unset | Optional headless seed for the first admin, used only on an empty database |
| `BINANCE_BASE_URL`, `BINANCE_FUTURES_BASE_URL`, `FRED_BASE_URL` | public endpoints | Data source base URLs |
| `BINANCE_KLINE_LIMIT` | `100` | Candles fetched per symbol and timeframe |
| `BINANCE_DERIVATIVES_HISTORY_LIMIT` | `30` | Derivatives history points per request |

The tracked symbols are set in `src/lib/config/symbols.ts`.

## Data sources

| Data | Source | Notes |
| --- | --- | --- |
| Crypto candles | Binance spot klines | Public API, no key |
| Derivatives context | Binance USD-M Futures public endpoints | Funding, open interest, long/short ratio, basis |
| Liquidations | Binance `!forceOrder@arr` stream | Live only: history starts when the stream starts |
| Cross-market series | FRED CSV downloads | Daily; gold and the dollar use documented proxies |

LariPulse only reads public market data. It stores no exchange credentials, balances or orders. You are responsible for following each provider's terms of use and rate limits.

## How it works

```text
Data sources → collectors → SQLite → indicators → widget engines → widget results → API → dashboard
```

- Collectors only fetch, validate, normalize, store and log.
- Indicators are pure functions.
- Widget engines combine several inputs into a structured result. Confidence drops when inputs conflict or data is stale.
- Route handlers stay thin and call services. The API never returns raw provider payloads.

Further reading:

- [docs/architecture.md](docs/architecture.md): layers, schema, widget contract and API list
- [docs/widgets.md](docs/widgets.md): every widget, its inputs and rules
- [docs/auth.md](docs/auth.md): accounts, roles and access
- Feature docs: [Situation Overview](docs/SITUATION_OVERVIEW.md), [Alerts](docs/ALERTS.md), [Opportunity Radar](docs/OPPORTUNITY_RADAR.md), [Chart Overlays](docs/CHART_OVERLAYS.md), [Liquidations](docs/LIQUIDATIONS_WIDGET.md), [Derivatives](docs/DERIVATIVES_CONTEXT.md), [Portfolio](docs/PORTFOLIO.md)

## Development

```bash
npm run lint
npm run typecheck
npm run test:db && npm run test:auth && npm run test:indicators && npm run test:correlations
npm run test:collectors && npm run test:widgets && npm run test:services && npm run test:scheduler

npx playwright install chromium
npm run test:e2e
```

The Playwright suite does the following:

- starts the app on a fresh database;
- goes through first-run setup;
- checks roles, invites and the main views with a mocked market API, on mobile, tablet and desktop viewports.

To reset your local database, stop the app, delete `data/laripulse.sqlite` and its `-wal`/`-shm` files, and run `npm run db:init`.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Disclaimer

LariPulse produces analytical summaries of available market data. It is not financial advice, does not give buy or sell instructions, and does not guarantee future performance.

## License

[MIT](LICENSE)
