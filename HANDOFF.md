# HANDOFF.md

Operational handoff for the TCM Events project. Read `CLAUDE.md` first for
architecture; this file is the live status and "how to operate it" notes.

## Live endpoints

| Piece | URL / location |
|---|---|
| Frontend (GitHub Pages) | https://zay1d.github.io/TCM_EVENTS/ |
| API (Contabo VPS) | https://tcm.167-86-125-229.sslip.io |
| API health check | `GET /api/health` → `{"ok":true}` |
| Repo | `zay1d/TCM_EVENTS`, default & deploy branch: `claude/dazzling-knuth-JnBad` |
| Document storage | Cloudflare R2 bucket `tcm-events-documents` |

## Hosting / infra choices (and why)

- **Frontend on GitHub Pages** — free, HTTPS, public repo. Deploys via
  `.github/workflows/deploy-pages.yml` (publishes only `index.html`). Source in
  repo Settings → Pages is set to **GitHub Actions**.
- **Backend on Contabo VPS** — Node/Express + PostgreSQL, nginx + Let's Encrypt.
  Express binds `127.0.0.1` only; nginx terminates TLS and proxies.
- **HTTPS for the API without a bought domain** — uses `sslip.io` (the host
  `tcm.167-86-125-229.sslip.io` resolves to the VPS IP `167.86.125.229`).
  Fallback if Let's Encrypt rate-limits sslip.io: a free DuckDNS subdomain.
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
