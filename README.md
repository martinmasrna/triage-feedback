# Pediatric Triage-Feedback Tool

A small Slovak, doctor-facing web tool where pediatric clinicians run **mock** patient cases
through an automated triage system, see what it decided and why, then record whether they
**agree or disagree** with that decision (plus an optional comment). Each saved case is a
labeled, critiqued data point for improving the triage logic. **Not a clinical device. Mock
data only.**

See `docs/spec.md` for the full design and `docs/triage-rules-provisional.md` for the draft
clinical rule set (needs clinical sign-off).

## Layout

```
server/   TypeScript backend: rule engine, LLM extractor, SQLite store, export, HTTP API
web/      Plain Vue 3 + Vite front end (Slovak, doctor-facing)
docs/     Spec and provisional clinical rules
```

## Running it (development)

**One-click (Windows):** double-click `start-dev.bat` — it opens both servers in their own
windows. Then open **http://127.0.0.1:5173**. (First time only: run `npm install` in `server/`
and `web/` first.)

**Or manually** — two processes, from two terminals:

```
# 1) API (http://127.0.0.1:8787)
cd server
npm install
npm start            # or: npm run dev   (auto-reload)

# 2) UI (http://localhost:5173, proxies /api to the server)
cd web
npm install
npm run dev
```

Open http://localhost:5173.

### Doctor vs. admin views
The doctor-facing app is `/` (new case), `/cases` (their cases). A separate **admin/research**
area lives at **`/admin/cases`** — reachable by URL only (not linked in the nav). It shows the
full record incl. the silent LLM second opinion + extraction trace, plus the JSON/CSV export
buttons. There is **no login**: the separation is at the API boundary (`/api/cases*` is stripped
of the silent fields; `/api/admin/*` returns the full record), suited to a single trusted
internal host.

Without a local model the server uses a stub reader (no extraction / second opinion); the rest
of the tool works fully. To wire in a local model, run a llama.cpp server (OpenAI-compatible) and
put its address in **`server/.env`** — the server loads it automatically on every start (`npm
start`, `npm run dev`, and `start-dev.bat`), so you never retype it:

```
cd server
cp .env.example .env     # PowerShell: Copy-Item .env.example .env
# then edit .env:
#   LLAMA_URL=http://127.0.0.1:8080   # llama.cpp server (omit/blank → StubReader)
#   LLAMA_MODEL=<model-id>            # stamped into provenance
#   PROMPT_LANG=en                    # or "sk" for the Slovak-instructions prompt variant
#   PORT / DB_PATH / RULES_PATH       # optional overrides
```

`.env` is git-ignored. Anything set in the actual environment overrides the file, so you can still
point elsewhere ad-hoc: `$env:LLAMA_URL="http://other:8009"; npm start`.

## Tests

```
cd server && npm test      # 99 tests: engine, domain, store, export, LLM reader, API
cd server && npm run typecheck
cd web && npm run typecheck
```

## Production (single host)

Build the UI (`cd web && npm run build` → `web/dist`) and serve it from the same host as the
API. Everything stays on one local/internal machine — no external exposure, the on-prem shape
real patient data would later require.
