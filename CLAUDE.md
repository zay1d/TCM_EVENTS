# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## What this is

**TCM Events** — a marketing event-management web app for Tashkent City Mall.
A single-file planning tool (phases, checklists, RACI, templates, annual plan,
calendar) that has been extended with a **cloud layer** so the same events are
shared by everyone, with two roles (owner edits, everyone else views).

## Architecture

```
Browser ──HTTPS──► GitHub Pages (frontend: index.html)
   │
   ├── REST API ──► Contabo VPS: nginx (TLS) → Node/Express (127.0.0.1) → PostgreSQL
   │                 https://tcm.167-86-125-229.sslip.io
   │
   └── presigned PUT/GET ──► Cloudflare R2 (document storage)
```

- **Frontend** — `index.html`, a single self-contained file (vanilla HTML/CSS/JS).
  Deployed to GitHub Pages by `.github/workflows/deploy-pages.yml` on every push
  to the default branch. Site: https://zay1d.github.io/TCM_EVENTS/
- **Backend** — `server/` (Node + Express + PostgreSQL), runs on a Contabo VPS
  behind nginx with Let's Encrypt TLS, listening on loopback only.
- **Storage** — uploaded documents go straight from the browser to Cloudflare R2
  via presigned URLs; only metadata is stored in Postgres.

## index.html layout (important)

The file has three `<script>` blocks, in order:

1. **Cloud config** — one line: `window.TCM_API_BASE = "<api-url>"`.
   Empty string ⇒ the app runs fully standalone (file save/load), cloud layer off.
2. **Core app** — the original planning logic (phases, schedule, checklists,
   templates, RACI, annual plan, dashboard, `saveProject`/`restoreState`, …).
3. **TCM CLOUD LAYER** — an *additive* module (IIFE) that adds: events list,
   owner login, roles, server save/load, and R2 documents.

### Golden rule: do NOT modify the core planning logic

The cloud layer is intentionally additive. It reuses the core's globals and
functions (shared classic-script scope) and overrides a few via `window.*`
(`showArchiveScreen`, `archiveHandleFiles`, `confirmStartup`, and edit guards
like `toggleCheck`). When adding cloud behaviour, prefer the cloud module and
`window.*` overrides over editing core functions. If `TCM_API_BASE` is empty the
module returns early and the app behaves exactly like the original.

### State model

Each event is one row in `events` with a `state` JSONB blob that mirrors the
shape `saveProject()` produces: `projectName, projectOwner, currentEventType,
eventDates, eventDurations, eventProductionDays, projectStartDates, checked,
disabled, annualData, annualYear`. The cloud `collectState()` (in the cloud
module) must stay in sync with this shape — if a new piece of state is added to
the core, add it there too (Date fields are serialized to ISO strings).
Documents are **not** in `state`; they live in R2 + the `documents` table.

## Conventions

- **Secrets** live only in `server/.env` (gitignored). Never commit them and
  never put them in `index.html` — the frontend is public.
- **Roles**: reads are public; writes require the owner JWT (server-enforced).
  Frontend role gating is UX only; real security is on the API.
- **No autosave** — changes persist only on the explicit "☁ Сохранить" button.
- After editing `index.html`, syntax-check each script block before committing
  (see below) — a broken block silently breaks the page.

## Commands

Frontend (deploy is automatic on push):
```bash
git push origin <default-branch>   # GitHub Actions rebuilds Pages
```

Validate index.html script blocks after edits:
```bash
node -e 'const fs=require("fs"),cp=require("child_process");
const h=fs.readFileSync("index.html","utf8");const re=/<script>([\s\S]*?)<\/script>/g;
let m,n=0;while((m=re.exec(h))){n++;fs.writeFileSync("/tmp/b"+n+".mjs",m[1]);
cp.execSync("node --check /tmp/b"+n+".mjs");}console.log(n,"blocks OK");'
```

Backend (run on the VPS — see `deploy/README.md`):
```bash
cd /opt/tcm_events/server
npm install --omit=dev
npm run migrate                 # apply schema.sql
npm run hash -- "ownerPassword" # → OWNER_PASSWORD_HASH for .env
sudo systemctl restart tcm-events
```

## API (summary)

| Method | Path | Access |
|---|---|---|
| POST | `/api/auth/login` | password → JWT |
| GET | `/api/events`, `/api/events/:id` | public |
| POST/PUT/DELETE | `/api/events[/:id]` | owner |
| GET | `/api/events/:id/documents`, `/api/documents/:id/download` | public |
| POST | `/api/events/:id/documents/presign`, `/api/documents/:id/confirm` | owner |
| DELETE | `/api/documents/:id` | owner |

## Notes for working here

- This repo is operated by two Claudes: one (this one) edits the frontend/repo;
  another has SSH access to the VPS for backend/deploy. Backend `.env`, certbot,
  systemd and DB live on the VPS and are managed there.
- The default branch is also the deploy branch; pushing to it ships the site.
- See `HANDOFF.md` for current status and operational details.
