# HANDOFF.md

Operational handoff for the TCM Events project. Read `CLAUDE.md` first for
architecture; this file is the live status and "how to operate it" notes.

## Live endpoints

| Piece | URL / location |
|---|---|
| Frontend (GitHub Pages) | https://zay1d.github.io/TCM_EVENTS/ |
| API (corporate VM) | https://tcm-events.tail226d37.ts.net (Tailscale Funnel → 127.0.0.1:8080) |
| API health check | `GET /api/health` → `{"ok":true}` |
| Corporate VM (SSH) | `ssh -i <key> -p 54323 admintg@90.156.197.14` (Ubuntu 22.04) |
| Old backend (fallback) | Contabo `https://tcm.167-86-125-229.sslip.io` — keep until verified, then decommission |
| Repo | `zay1d/TCM_EVENTS`, default & deploy branch: `claude/dazzling-knuth-JnBad` |
| Document storage | Cloudflare R2 — bucket `tcm-events-documents` (⚠ R2 keys not yet in `.env`; docs feature off until added) |

## Hosting / infra choices (and why)

- **Frontend on GitHub Pages** — free, HTTPS, public repo. Deploys via
  `.github/workflows/deploy-pages.yml` (publishes only `index.html`). Source in
  repo Settings → Pages is set to **GitHub Actions**.
- **Backend on the corporate VM** (`90.156.197.14`, Ubuntu 22.04, user `admintg`)
  — Node/Express + PostgreSQL. Express binds `127.0.0.1:8080`; runs as systemd
  unit `tcm-events`. Migrated here from Contabo on 2026-06-15.
- **HTTPS without a white IP / free ports** — the VM has no dedicated public IP
  and 80/443 are taken, so the API is exposed via **Tailscale Funnel** (outbound,
  auto-TLS): `https://tcm-events.tail226d37.ts.net` → `127.0.0.1:8080`.
  Funnel runs in the background (`tailscale funnel --bg 8080`); `tailscaled` is a
  systemd service, so it survives reboot.
- **Documents on Cloudflare R2** — browser uploads direct to R2 (presigned),
  so the VPS isn't loaded with file traffic; free egress.

## What works (done)

- ✅ Single-file app committed and deployed to Pages (auto-deploy on push).
- ✅ Backend deployed on the VPS; API reachable over HTTPS; DB migrated.
- ✅ R2 configured (bucket + API token + CORS for the Pages origin).
- ✅ Cloud layer in `index.html`:
  - Owner login via in-page modal (password → JWT). Viewers = read-only.
  - **Multi-event**: header buttons **📋 Ивенты** (list) and **➕ Создать новый**
    (owner; uses the original "Новое мероприятие" modal). List has open / 🗑 delete.
  - Entry screen is the events list, so re-entry never sticks to one event.
  - Server save on explicit **☁ Сохранить** only (no autosave); unsaved-exit warning.
  - Documents uploaded/downloaded via R2 from the Архив screen.
- ✅ Colleague's checklist **on/off toggle** feature (exclude a task from progress;
  `disabled` state) merged and wired into cloud save.

## Configuration that lives OFF the repo (on the VPS, in `server/.env`)

Never commit these. Set/rotate on the VPS, then `sudo systemctl restart tcm-events`.

```
PORT, HOST, CORS_ORIGINS=https://zay1d.github.io
JWT_SECRET                 # openssl rand -hex 32
OWNER_PASSWORD_HASH        # npm run hash -- "password"
DATABASE_URL
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_ENDPOINT
```

## Common operations

- **Change the owner password**: on VPS → `cd /opt/tcm_events/server` →
  `npm run hash -- "newPassword"` → put hash in `.env` as `OWNER_PASSWORD_HASH`
  → `sudo systemctl restart tcm-events`.
- **Point the frontend at a different API**: edit the `window.TCM_API_BASE` line
  in `index.html` (TCM CLOUD CONFIG block) → commit/push → Pages redeploys.
- **Wipe all data (clean slate)**: either delete each event via 🗑 in the list
  (also removes its R2 docs), or on the VPS `psql "$DATABASE_URL" -c
  'TRUNCATE events CASCADE;'` (note: R2 objects are then orphaned).
- **Deploy frontend change**: just push to the default branch; Actions rebuilds.

## Two-agent workflow

- **Repo/frontend agent** (this session): edits `index.html`, `server/` source,
  workflows, docs; commits and pushes. No SSH to the VPS.
- **Server agent**: has SSH to the Contabo VPS; runs install/migrate/certbot,
  edits `.env`, restarts the service. Give it tasks as command blocks.

## Troubleshooting

- **Events list shows an error / network fail** → CORS. `.env` `CORS_ORIGINS`
  must be exactly `https://zay1d.github.io`; restart the service. Check the
  browser console (F12) for the exact message.
- **Document upload fails** → R2 bucket CORS must allow `https://zay1d.github.io`
  with `PUT`.
- **Login "Неверный пароль"** → `OWNER_PASSWORD_HASH` mismatch; re-hash and restart.
- **Page looks stale after deploy** → hard refresh (Ctrl+Shift+R); GitHub Pages
  also needs a minute to propagate.
- **Blank page / dead buttons after editing index.html** → a broken `<script>`
  block; validate blocks (see `CLAUDE.md` → Commands) and redeploy.

## Possible next steps

- Verify document upload/download end-to-end on the live site.
- Optional: nicer login modal styling, per-event document counts in the sidebar.
- Optional: move backend to a bought domain + Cloudflare Tunnel (no certbot,
  no open ports) if the team buys a domain.
