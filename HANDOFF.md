# HANDOFF.md

Operational handoff for the TCM Events project. Read `CLAUDE.md` first for
architecture; this file is the live status and "how to operate it" notes.

## Live endpoints

| Piece | URL / location |
|---|---|
| Frontend (GitHub Pages) | https://zay1d.github.io/TCM_EVENTS/ |
| API (corporate VM) | https://tcm-events.tail226d37.ts.net (Tailscale Funnel → 127.0.0.1:8080) |
| API health check | `GET /api/health` → `{"ok":true}` |
| Corporate VM (SSH) | `ssh -i ~/.ssh/tcm_admintg_ed25519 -p 54323 admintg@90.156.197.14` (host `hostingtg`) |
| Old backend (dead) | Contabo `https://tcm.167-86-125-229.sslip.io` — TLS cert expired, no longer used; decommission |
| Repo | `zay1d/TCM_EVENTS`, default & deploy branch: `claude/dazzling-knuth-JnBad` |
| Document storage | Cloudflare R2 — bucket `tcm-events-documents` (keys in `.env`, verified working) |

## Hosting / infra choices (and why)

- **Frontend on GitHub Pages** — free, HTTPS, public repo. Deploys via
  `.github/workflows/deploy-pages.yml` (publishes only `index.html`). Source in
  repo Settings → Pages is set to **GitHub Actions**.
- **Backend on the corporate VM** (`90.156.197.14`, user `admintg`, host `hostingtg`)
  — Node/Express + PostgreSQL. Express binds `127.0.0.1:8080`; runs as systemd
  unit `tcm-events`. Repo checkout at `/opt/tcm_events` (root-owned; use `sudo git`).
  Migrated here from Contabo on 2026-06-15.
- **HTTPS without a white IP / free ports** — the VM has no dedicated public IP
  and 80/443 are taken (SSH is on 54323), so the API is exposed via **Tailscale
  Funnel** (outbound, auto-TLS): `https://tcm-events.tail226d37.ts.net` →
  `127.0.0.1:8080`. Funnel runs in the background (`tailscale funnel --bg 8080`);
  `tailscaled` is a systemd service, so it survives reboot.
- **Documents on Cloudflare R2** — browser uploads direct to R2 (presigned),
  so the VM isn't loaded with file traffic; free egress.

## What works (done)

- ✅ App committed and deployed to Pages (auto-deploy on push).
- ✅ Backend on the corporate VM; API reachable over HTTPS; DB migrated with data.
- ✅ Cloud layer in `index.html`:
  - Owner login via in-page modal (password → JWT). Viewers = read-only.
  - **Multi-event**: header buttons **📋 Ивенты** (list) and **➕ Создать новый**
    (owner; uses the original "Новое мероприятие" modal). List has open / 🗑 delete.
  - Entry screen is the events list, so re-entry never sticks to one event.
  - Server save on explicit **☁ Сохранить** only (no autosave); unsaved-exit warning.
  - Documents uploaded/downloaded via R2 from the Архив screen.
- ✅ Colleague features merged: checklist **on/off toggle** (`disabled` state) and
  **project start date** (`projectStartDates`); both wired into cloud save.
- ✅ Backend R2 access verified (put/get/delete on `tcm-events-documents` succeed).
- ✅ Server resilience: async route handlers wrapped (`server/src/async.js`) +
  `unhandledRejection` guard so a DB error returns 500 instead of crashing the
  process (fixed the 502 crash-loop — see Incidents).

## Pending / to verify

- ⏳ **Document upload end-to-end from the browser** — backend + keys are fine; the
  only unverified piece is the **R2 bucket CORS** (must allow `https://zay1d.github.io`
  with `PUT`/`GET`). Set/confirm it in the Cloudflare dashboard (R2 → bucket →
  Settings → CORS Policy), then test an upload on the Архив screen.
- ⏳ Decommission the old Contabo box (cert dead; keep a final DB backup first).

## Configuration that lives OFF the repo (on the VM, in `/opt/tcm_events/server/.env`)

Never commit these. `.env` is root-owned, chmod 600. Edit with `sudo`, then
`sudo systemctl restart tcm-events`.

```
PORT, HOST, CORS_ORIGINS=https://zay1d.github.io
JWT_SECRET                 # openssl rand -hex 32
OWNER_PASSWORD_HASH        # npm run hash -- "password"
DATABASE_URL               # postgres://tcm:<pw>@localhost:5432/tcm_events
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_ENDPOINT
```

PostgreSQL: role `tcm`, database `tcm_events`, tables `events`, `documents`. The
DB password must match on both sides — the Postgres role and `DATABASE_URL`.

## Common operations

- **Deploy backend change**: `sudo git -C /opt/tcm_events pull --ff-only &&
  sudo systemctl restart tcm-events`. (No new deps → no `npm install` needed.)
- **Deploy frontend change**: push to the default branch; Actions rebuilds Pages.
- **Point the frontend at a different API**: edit the `window.TCM_API_BASE` line
  in `index.html` (TCM CLOUD CONFIG block) → commit/push → Pages redeploys.
- **Change the owner password**: on VM → `cd /opt/tcm_events/server` →
  `npm run hash -- "newPassword"` → put hash in `.env` as `OWNER_PASSWORD_HASH`
  → `sudo systemctl restart tcm-events`.
- **Reset the DB password** (both sides): `sudo -u postgres psql -c "ALTER USER
  tcm WITH PASSWORD 'NEW';"` then update the password in `DATABASE_URL` in `.env`
  → restart. Keep them identical or the app gets Postgres error 28P01.
- **Wipe all data (clean slate)**: delete each event via 🗑 in the list (also
  removes its R2 docs), or on the VM `psql "$DATABASE_URL" -c 'TRUNCATE events
  CASCADE;'` (note: R2 objects are then orphaned).

## Access / who does what

- Ops on the VM are done over SSH with `~/.ssh/tcm_admintg_ed25519`
  (`admintg@90.156.197.14:54323`). The private key stays on the operator's machine
  only — never commit it. The key travelled through chat once, so rotate the SSH
  keypair when convenient.
- Frontend/repo changes are committed and pushed from a checkout; Pages
  auto-deploys.

## Troubleshooting

- **"Failed to fetch" / events list won't load** → first check the API is up:
  `curl https://tcm-events.tail226d37.ts.net/api/health` (expect `{"ok":true}`)
  and `.../api/events`. If health flaps 200↔502, it's a **backend crash-loop** —
  see Incidents (usually a DB error). Check `journalctl -u tcm-events -n 40`.
- **`/api/events` is 502 but `/api/health` is 200** → a DB query is failing.
  Common cause: Postgres error **28P01** (password auth) — the `tcm` role password
  and `DATABASE_URL` disagree. Re-sync them (see Common operations).
- **CORS error in console** → `.env` `CORS_ORIGINS` must be exactly
  `https://zay1d.github.io`; restart the service.
- **Document upload fails with a CORS error to `*.r2.cloudflarestorage.com`** →
  R2 **bucket** CORS must allow `https://zay1d.github.io` with `PUT` (set in the
  Cloudflare dashboard; the object API token cannot change it).
- **Login "Неверный пароль"** → `OWNER_PASSWORD_HASH` mismatch; re-hash and restart.
- **Page looks stale after deploy** → hard refresh (Ctrl+Shift+R); Pages also
  needs a minute to propagate.
- **Blank page / dead buttons after editing index.html** → a broken `<script>`
  block; validate blocks (see `CLAUDE.md` → Commands) and redeploy.

## Incidents

- **2026-07-07 — site "Failed to fetch".** Root cause: after the migration the
  `tcm` Postgres role password didn't match `DATABASE_URL` (error 28P01); every
  DB request threw an unhandled async rejection and Node 20 killed the process,
  so the API crash-looped (health flapped 200↔502). Fix: re-synced the DB password
  and deployed the async-handler/`unhandledRejection` hardening (commit `35f03f7`)
  so DB errors now return a clean 500 instead of crashing.
