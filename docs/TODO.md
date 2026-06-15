# TODO — next session

Status: full stack built and working (server 61 tests green; Vue UI runs, verified). Backend = engine + LLM reader (real model, StubReader fallback) + SQLite store + export + Hono API. See docs/spec.md for design, README.md to run. This file = the agreed next-session work.

> Flow simplified 2026-06-11 (user’s team). The doctor no longer assigns a triage color. The verdict is now a simple agree / disagree with the system’s decision, plus one optional free-text comment. This removed: doctor color, the color_reason/system_critique split, the blind-first/informed modes (and web/src/settings.ts), the anti-anchoring gate, and the derived agreement distance. The doctor always sees the system result first. docs/spec.md reconciled (v1.1).

---

## 1. Connect the local LLM — DONE & VERIFIED 2026-06-10
Server now talks to a real model; StubReader only when no LLAMA_URL. Verified working config (the model server is run/owned by the user, not on this dev box):
- LLAMA_URL=http://10.141.106.183:8009
- LLAMA_MODEL=gemma-4-26B-A4B-it-UD-Q4_K_M.gguf
- PROMPT_LANG=en
It’s a llama.cpp server (owned_by: llamacpp). Gemma-4-26B-A4B is a reasoning model: it returns a big reasoning_content plus clean schema-constrained content. Our client reads only content, so parsing is unaffected — but reasoning adds latency (~6s/call remotely; two calls per evaluate). Client timeout is 30s/call; held fine in testing. Watch item: bump timeoutMs if long notes ever time out.

- [ ] Start the offline spot-audit habit: sample saved cases, check extracted findings vs the note (especially on disagreements).
- Files: server/src/llm/{client,reader,schema}.ts, server/prompts/*.md, server/src/server.ts.

## 2. Polish design — DONE 2026-06-10; redesigned 2026-06-11
Tailwind CSS v4 design system (web/src/style.css: @theme tokens + @apply component classes).
- “Clinical Calm” palette (2026-06-11): primary = teal #0e8a8a (was indigo), warmed slate-teal neutrals, Plus Jakarta Sans. Triage chips: yellow uses dark text.
- Sidebar app-shell (2026-06-11): top header replaced by a deep teal-slate sidebar (App.vue) — brand + “Nový prípad” + collapsible recent-cases list; breadcrumb topbar. Static mock-ups in mockups/.
- Visible focus states; consistent button hierarchy (.btn/.btn-primary/.btn-ghost), hover lift on primary, segmented age toggle.
- (Skipped by decision) responsive/mobile — desktop-only for now.

## 3. Improve UI/UX — largely DONE 2026-06-10
New Case is now a 4-step wizard (see spec v1.1).
- Show Slovak labels, not keys — shared cached web/src/vocab.ts (useVocab()); list + detail use it; vitals also show their unit.
- Entry form ergonomics: per-field inline validation + clear required markers on step 1.
- 14 findings grouped into clinical sections (web/src/discriminatorGroups.ts, presentational only).
- Result screen scannable (stepper + summary card before the reveal).
- Saved list: sorting (Čas/Vek) + empty state. Pagination still TODO if it grows.
- Loading state: spinner during the ~6–12s evaluate.
- Files: web/src/views/*.vue, web/src/components/*.vue, web/src/discriminatorGroups.ts.

## 3b. Doctor ↔ admin separation — DONE 2026-06-10, still current
Endpoint-level access split: toDoctorCase() strips second opinion / extraction / provenance from /api/cases*; full record + exports under /api/admin/*. Web /admin/cases* routes (URL-only).

## 3c. Verdict → agree/disagree — NEW, DONE 2026-06-11
Replaces the 2026-06-10 two-field verdict (color_reason + system_critique), which is gone.
- Verdict is now { agrees: boolean, comment?: string }. UI step 4: system result + rule explanation → „Súhlasím“ / „Nesúhlasím“ → optional comment → save.
- PATCH /api/cases/:id now edits only comment (api.patchComment); agrees is immutable.
- CSV columns: doctor_agrees + doctor_comment (was doctor_color/agreement/mode/color_reason/system_critique). SQLite lifted cols: system_color, agrees.
- [ ] Open (user spec): comment is OPTIONAL even on disagree. If “disagree with no reason” proves useless for analysis, make it required — one zod refine + one canSave tweak.

## 4. Add seed data (~30 cases)
Coverage instrument: the cases improvisation misses. Target ~30: ~9 red-flag floor · ~8 age-banded-vital demos across bands · ~6 edge/ambiguous · ~4 known-hard · ~3 well/everyday — covering all 6 age bands and all 10 complaint categories.
- [ ] Decide the load mechanism (not built yet): a server/seeds/seeds.yaml + an API endpoint (GET /api/seeds) + a “load seed case” picker on the entry screen that pre-fills the form.
- [ ] Author the ~30 cases: each = age + complaint + rich Slovak note (so it also exercises the extractor) + optional vitals/findings. Optional expected_color/expected_rule tag for coverage tracking (NOT the doctor’s verdict — the doctor still agrees/disagrees per case).
- [ ] Send seed content to clinicians for review (like the rules).

---

## Carry-over open items (not blocking dev)
- [ ] Clinical sign-off on docs/triage-rules-provisional.md — the one true blocker for real use.
- [ ] fever ≥ 38 → YELLOW was encoded but flagged ambiguous in the draft rules — confirm with clinicians.
- [ ] Findings UI grouping: AVPU (bezvedomie/porucha vedomia), bolesť, dychová tieseň, and dehydratácia were each merged into a single 4-state severity control (web-only; discriminatorGroups.ts). Left as 3 separate toggles: ohrozené dýchacie cesty / apnoe (neadekvátne dýchanie) / dychová tieseň (závažná/stredná) — unclear whether clinicians think of these as one “breathing problem severity” continuum (like AVPU) or as genuinely separate axes (airway patency vs. breathing adequacy vs. work of breathing) that shouldn’t be forced onto one scale. Confirm with clinicians.

Notes
- Env gotchas on this machine (so you don’t relearn them) kept as-is in the repo root where relevant.

Environment variables to add (for your server/.env)
- ADMIN_ENABLED=false
- ADMIN_USER=admin
- ADMIN_PASS=please-change
- CORS_ORIGIN=http://127.0.0.1:5173
- MAX_BODY_BYTES=65536
- WEB_ROOT=../web/dist
- NODE_ENV=production