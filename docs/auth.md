# Accounts, Roles and Access

LariPulse is built for self-hosting. One install is one organization: market data, widget results and Situation Overview snapshots are shared by everyone on the instance, while portfolios and alerts belong to individual users.

## Roles

| Role | Can do |
| --- | --- |
| `viewer` | Read the dashboard, markets, radar, chart overlays and Situation Overview |
| `analyst` | Everything a viewer can, plus a private portfolio and private alert rules |
| `admin` | Everything, plus users, invites, instance settings, widget visibility and manual collection runs |

Roles are ranked `viewer < analyst < admin`. Services check them with `requireRole(session, minimum)` from `src/lib/auth/access.ts`:

- an anonymous visitor gets **401 Sign in required**;
- a signed-in user below the required role gets **403**.

Portfolio items, alert rules and alert events carry a `user_id`. Every query filters by the signed-in user, so one analyst never sees another analyst's holdings or alerts, and admins don't browse them either.

## First run

A fresh database has no users. Every page then redirects to `/setup`, where you create the first admin account. `/setup` stops working as soon as one user exists.

For headless installs you can seed the first admin from the environment instead:

```text
LARIPULSE_ADMIN_EMAIL=admin@example.com
LARIPULSE_ADMIN_PASSWORD=a-long-random-password
```

The seed runs on startup only when **both** variables are set **and** the database has no users. It never changes an existing account, so you can remove the variables after the first start.

## Adding people

Sign-up is **closed** by default. Admins add people from **Settings → Users & Invites**:

1. Pick a role and, optionally, the email address the invite is for.
2. Copy the one-time link (`/signup?invite=…`) and send it however you like. No mail server is needed.
3. The person opens the link and chooses a password. The account gets the invite's role.

Invites expire after `LARIPULSE_INVITE_MAX_AGE_SECONDS` (7 days by default), work once, and can be revoked while pending. Only a SHA-256 hash of the token is stored, so a lost link cannot be shown again; create a new one.

An admin can switch **Open sign-up** on under **Settings → Instance**. Anyone who reaches `/signup` can then create a `viewer` account; an admin can promote them later.

## Managing users

From **Settings → Users & Invites** an admin can change a user's role, disable or re-enable the account, or delete it. Disabling or deleting signs the user out everywhere. Deleting a user also deletes their portfolio and alerts.

The instance always keeps at least one active admin: you cannot demote, disable or delete the last one, and you cannot delete your own account.

## Public read-only dashboard

With **Settings → Instance → Public read-only dashboard** on, anonymous visitors are treated as viewers. They can browse the dashboard, markets and radar without signing in, but cannot see Alerts, Portfolio or Settings, and every write endpoint still requires an account. Leave it off to require sign-in for everything.

## Sessions and passwords

- Passwords are hashed with scrypt and must be 8–256 characters.
- Sessions are random 256-bit tokens sent in the HTTP-only `laripulse_session` cookie (`Secure` in production). Only a SHA-256 hash is stored in `sessions`.
- Sessions last `LARIPULSE_SESSION_MAX_AGE_SECONDS` (30 days by default).
- Changing your password in **Settings → Account** signs out your other sessions.

## Sign-in throttling

Failed sign-ins are limited in memory: 5 failures per account and client IP, and 25 per IP, in a 15-minute window. Further attempts get **429** with a `Retry-After` header. The client IP comes from `X-Forwarded-For` or `X-Real-IP`, so put LariPulse behind a reverse proxy that sets these headers and do not expose the Node server directly. The counters reset when the process restarts.

## Password recovery

There is no email-based reset. On the machine that holds the SQLite database, run:

```bash
npm run user:reset-password -- admin@example.com
```

It prints a temporary password, re-enables the account if it was disabled and signs it out everywhere. Sign in and change the password from **Settings → Account**.

## API

```text
POST   /api/auth/setup            create the first admin (only while no users exist)
POST   /api/auth/signup           { email, password, inviteToken? }
POST   /api/auth/login            { email, password }
POST   /api/auth/logout
GET    /api/auth/session
POST   /api/auth/password         { currentPassword, newPassword }

GET    /api/admin/users
PATCH  /api/admin/users/:id       { role?, status? }
DELETE /api/admin/users/:id
GET    /api/admin/invites
POST   /api/admin/invites         { role, email? } → one-time link
DELETE /api/admin/invites/:id
GET    /api/admin/settings
PUT    /api/admin/settings        { signupMode?: "open" | "closed", publicDashboard?: boolean }
```

Example with curl:

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"admin@example.com","password":"a-long-random-password"}' \
  -c cookies.txt

curl -b cookies.txt http://localhost:3000/api/auth/session
curl -b cookies.txt -X POST http://localhost:3000/api/collect/run
```

## Upgrading an older database

The role model replaced an earlier schema. If LariPulse finds an old database on startup it stops with a message asking you to reset it. Stop the app, delete `data/laripulse.sqlite` and its `-wal`/`-shm` files, then run `npm run db:init`. Market data is re-collected on the next run.
