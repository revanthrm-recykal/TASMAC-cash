# Working Context — TASMAC Cash Tracker

> Live state for the next session. Update at: end of a feature, before parking, when picking up a new thread.

**Last updated:** 2026-06-22

---

## TL;DR for the next session

App is **built and ready to deploy on AWS EC2**. MySQL app DB is fully replaced with Google Sheets. Prisma is gone. Production build passes cleanly. Payment DB connects directly (no SSH tunnel) when hosted on Recykal's internal network.

---

## What this app is

Ground team agents (TOSHIT, VINEETH, MOHAN, RAVI, SUBASH + test users) pay customers cash when UPI refunds fail. The app tracks daily cash balances per agent and reads live transaction data from Recykal's payment DB.

---

## Architecture

| Layer | What |
|---|---|
| Framework | Next.js 16 App Router, TypeScript, Tailwind CSS |
| Auth | NextAuth.js — PIN for agents, password for admin |
| Agent / session storage | **Google Sheets** (no app DB) |
| Payment data | Read-only from `payment.direct_payout_txn` via `mysql2/promise` pool |
| Sheets client | `googleapis` package, service account credentials in env vars |

### Two data sources
- **Google Sheet** `19YqoJBFhi4T5LkPEt3vTmse02dN7PEdDrrI40kJHhCQ` — Agents tab + Sessions tab
- **Payment DB** `172.16.2.136:3306` (Recykal internal) — read-only, `payment.direct_payout_txn`

### Key files
| File | Role |
|---|---|
| `src/lib/sheets.ts` | All Google Sheets CRUD — agents + sessions |
| `src/lib/db.ts` | Payment DB pool only (mysql2) |
| `src/lib/queries.ts` | SQL queries against payment DB |
| `src/lib/auth.ts` | NextAuth config — reads agents from sheets for PIN auth |
| `src/app/api/agents/` | CRUD for agents (admin only) |
| `src/app/api/sessions/` | Cash session open/read |
| `src/app/api/transactions/` | Reads payment DB txns |
| `src/app/api/history/` | Per-agent day-wise history (sheets + payment DB joined) |
| `src/app/admin/page.tsx` | Admin dashboard |
| `src/app/dashboard/page.tsx` | Agent dashboard |
| `ecosystem.config.cjs` | PM2 config for production |
| `.env.production.example` | Template for server env vars |

---

## Transaction status classification

Three statuses from `payment.direct_payout_txn.txn_status`:
- `SUCCESS` — UPI succeeded (green)
- `FAILED` — UPI failed, agent paid cash (red) — this is the cash paid out amount
- `INITIATED` — pending (amber)

**Never lump INITIATED with FAILED.** All filters use explicit `=== "FAILED"` and `=== "INITIATED"`.

---

## Google Sheets structure

**Agents tab** — columns: `id | name | upiIds (JSON string) | pinHash | isActive | createdAt | updatedAt`

**Sessions tab** — columns: `id | agentId | sessionDate | carryOver | cashAdded | openingBalance | createdAt`

`ensureSheets()` in `sheets.ts` auto-creates tabs and headers on first request if missing.

---

## Local dev

```bash
npm run dev        # http://localhost:3000
```

Payment DB requires SSH tunnel locally (direct IP not reachable from laptop):
```bash
ssh -N tasmac-db-replica   # keep this terminal open
```
And set in `.env.local`:
```
PAYMENT_DB_HOST=127.0.0.1
PAYMENT_DB_PORT=3307
```

On Recykal's server: use `PAYMENT_DB_HOST=172.16.2.136` and `PAYMENT_DB_PORT=3306` directly — no tunnel.

---

## Env vars required

| Var | Value |
|---|---|
| `NEXTAUTH_SECRET` | Random string (run `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Production URL e.g. `http://your-ec2-ip` |
| `ADMIN_PASSWORD` | Admin login password |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `tasmac-cash@tasmac-cash.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Full private key from service account JSON |
| `GOOGLE_SHEET_ID` | `19YqoJBFhi4T5LkPEt3vTmse02dN7PEdDrrI40kJHhCQ` |
| `PAYMENT_DB_HOST` | `172.16.2.136` (server) or `127.0.0.1` (local) |
| `PAYMENT_DB_PORT` | `3306` (server) or `3307` (local tunnel) |
| `PAYMENT_DB_USER` | `revanth` |
| `PAYMENT_DB_PASSWORD` | (ask Revanth) |
| `PAYMENT_DB_NAME` | `payment` |

---

## Deploy to AWS EC2

```bash
# On EC2 instance
git clone / scp the project
npm install --omit=dev
npm run build

# Create .env.production from template
cp .env.production.example .env.production
# Fill in NEXTAUTH_URL with EC2 public IP or domain

# Start with PM2
pm2 start ecosystem.config.cjs --env production
pm2 save && pm2 startup
```

**Network requirement:** EC2 must be in Recykal's VPC (or peered) to reach `172.16.2.136`. Confirm with DevOps before deploying to a separate AWS account.

---

## Active threads

None — app is build-clean and deploy-ready.

## Parked

- **`NEXTAUTH_SECRET` strength** — current value in `.env.production.example` is weak. Remind user to run `openssl rand -base64 32` and use that before going live.
- **Nginx / HTTPS** — no reverse proxy set up yet. App runs on port 3000. For production, add Nginx to proxy 80/443 → 3000 and set up SSL via certbot.

---

## Agents migrated (from MySQL → Google Sheets on 2026-06-22)

TOSHIT (1), Revanth (2), Vineeth (3), RAVI (4), Recykal (5), Mohan (6) — 6 agents, 4 sessions migrated.
