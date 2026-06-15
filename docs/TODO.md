# TODO — next session

Status: full stack built and working (server **61 tests green**; Vue UI runs, verified). Backend =
engine + LLM reader (real model, StubReader fallback) + SQLite store + export + Hono API. See
`docs/spec.md` for design, `README.md` to run. This file = the agreed next-session work.

> **⚠️ FLOW CHANGED 2026-06-11 (user's team).** The doctor no longer assigns a triage color. The
> verdict is now a simple **agree / disagree** with the system's decision, plus one optional
> free-text comment. This removed: doctor color, the `color_reason`/`system_critique` split, the
> blind-first/informed **modes** (and `web/src/settings.ts`), the anti-anchoring gate, and the
> derived **agreement** distance. The doctor always sees the system result first. Sections below
> are annotated where this superseded earlier work. `docs/spec.md` still describes the OLD flow —
> not yet reconciled.

---

## 1. Connect the local LLM
**DONE & VERIFIED 2026-06-10** — server now talks to a real model; StubReader only when no LLAMA_URL.

Verified working config (the model server is run/owned by the user, not on this dev box):
- `LLAMA_URL=http://10.141.106.183:8009` `LLAMA_MODEL=gemma-4-26B-A4B-it-UD-Q4_K_M.gguf` `PROMPT_LANG=en`.
  (Endpoint host/port is not stable — was 8005 then 8009; re-confirm the live URL each session.)
- It's a **llama.cpp** server (`owned_by: llamacpp`). Gemma-4-26B-A4B is a **reasoning** model: it
  returns a big `reasoning_content` field plus the clean schema-constrained `content`. Our client
  reads only `content`, so parsing is unaffected — but reasoning adds latency (~6s/call at ~200 tok/s
  remotely; two calls per evaluate). Client timeout is 30s/call (`client.ts`); held fine in testing.
  Watch item: bump `timeoutMs` if long notes ever time out.

- [x] Stand up a **llama.cpp server** — already running on the user's network (not this box).
- [x] **Pick the model** — `gemma-4-26B-A4B-it-UD-Q4_K_M.gguf` (Slovak-capable; user's running model).
- [x] Start the API with env set → confirmed `buildReader()` flips StubReader → `LlmReader`.
- [x] **Verify constrained output**: `response_format: json_schema` IS honored — clean schema-valid
      JSON, no GBNF fallback needed.
- [x] **Sanity-check behavior**: end-to-end `/api/evaluate`+save with a real Slovak note — negation
      ("bez kŕčov" → `active_seizure: absent`, "čulé" → `altered_consciousness: absent`) ✓,
      "fever, no number" → did NOT invent a temp ✓, unmentioned findings → `unknown` ✓, prose
      "zaťahovanie medzirebrí" → `severe_resp_distress: present` → decision ORANGE ✓, silent
      second opinion stored (ORANGE) ✓, provenance stamped (model id + prompt 0.1.0-en) ✓.
- [ ] Start the **offline spot-audit** habit: sample saved cases, check extracted findings vs the
      note (especially on disagreements).
- Files: `server/src/llm/{client,reader,schema}.ts`, `server/prompts/*.md`, `server/src/server.ts`.

## 2. Polish design
**DONE 2026-06-10, redesigned 2026-06-11** — Tailwind CSS v4 design system (`web/src/style.css`:
`@theme` tokens + `@apply` component classes).

- [x] Tighter spacing/typography/card rhythm.
- [x] **"Clinical Calm" palette (2026-06-11): primary = teal `#0e8a8a`** (was indigo), warmed
      slate-teal neutrals, Plus Jakarta Sans. Teal still clears all 5 triage colors. Triage chips:
      yellow uses dark text.
- [x] **Sidebar app-shell (2026-06-11):** top header replaced by a deep teal-slate sidebar
      (`App.vue`) — brand + "Nový prípad" + collapsible recent-cases list; breadcrumb topbar.
      Static mock-ups for the chosen direction live in `mockups/`.
- [x] Visible focus states; consistent button hierarchy (`.btn`/`.btn-primary`/`.btn-ghost`),
      hover lift on primary, segmented age toggle.
- [ ] (Skipped by decision) responsive/mobile — desktop-only for now.

## 3. Improve UI/UX
**Largely DONE 2026-06-10** (New Case is now a 4-step wizard; see `docs/spec.md` addendum).

- [x] **Show Slovak labels, not keys** — shared cached `web/src/vocab.ts` (`useVocab()`); list +
      detail use it; vitals also show their unit.
- [x] Entry form ergonomics: per-field inline validation + clear required markers on step 1.
- [x] 14 findings grouped into clinical sections (`web/src/discriminatorGroups.ts`,
      presentational only).
- [x] Result screen scannable (stepper + summary card before the reveal).
- [x] Saved list: sorting (Čas/Vek) + empty state. Pagination still TODO if it grows.
- [x] Loading state: spinner during the ~6–12s evaluate.
- Files: `web/src/views/*.vue`, `web/src/components/*.vue`, `web/src/discriminatorGroups.ts`.

## 3b. Doctor ↔ admin separation (DONE 2026-06-10, still current)
- [x] Endpoint-level access split: `toDoctorCase()` strips second opinion / extraction /
      provenance from `/api/cases*`; full record + exports under `/api/admin/*`. Web `/admin/cases*`
      routes (URL-only).

## 3c. Verdict → agree/disagree (NEW, DONE 2026-06-11)
Replaces the 2026-06-10 two-field verdict (`color_reason` + `system_critique`), which is GONE.
- [x] Verdict is now `{ agrees: boolean, comment?: string }`. UI step 4: system result + rule
      explanation → **„Súhlasím" / „Nesúhlasím"** choice → optional comment → save.
- [x] Removed: doctor color + `ColorPicker`, blind/informed **modes** + `web/src/settings.ts` +
      anti-anchoring back-block, derived `Agreement`. The doctor sees the system result first.
- [x] `PATCH /api/cases/:id` now edits only `comment` (`api.patchComment`); `agrees` is immutable.
- [x] CSV columns: `doctor_agrees` + `doctor_comment` (was `doctor_color`/`agreement`/`mode`/
      `color_reason`/`system_critique`). SQLite lifted cols: `system_color`, `agrees`.
- [x] **61 server tests pass**; web typecheck+build clean; old `cases.db` deleted (incompatible
      schema) + fresh DB; live evaluate→save→patch→filter smoke test green with the real model.
- [ ] **Open (user spec):** comment is OPTIONAL even on disagree. If "disagree with no reason"
      proves useless for analysis, make it required — one zod `.refine` + one `canSave` tweak.

## 4. Add seed data (~30 cases)
Coverage instrument (Step 1): the cases improvisation misses. Target ~30 (agreed):
~9 red-flag floor · ~8 age-banded-vital demos across bands · ~6 edge/ambiguous · ~4 known-hard ·
~3 well/everyday — covering **all 6 age bands** and **all 10 complaint categories**.

- [ ] Decide the **load mechanism** (not built yet): a `server/seeds/seeds.yaml` + an API endpoint
      (`GET /api/seeds`) + a "load seed case" picker on the entry screen that pre-fills the form.
- [ ] Author the ~30 cases: each = age + complaint + **rich Slovak note** (so it also exercises
      the extractor) + optional vitals/findings. Optional `expected_color`/`expected_rule` tag for
      coverage tracking (NOT the doctor's verdict — the doctor still agrees/disagrees per case).
- [ ] Send seed content to **clinicians for review** (like the rules).

---

## Carry-over open items (not blocking dev)
- [ ] **Clinical sign-off** on `docs/triage-rules-provisional.md` — the one true blocker for real use.
- [ ] `fever ≥ 38 → YELLOW` was encoded but flagged ambiguous in the draft rules — confirm with clinicians.
- [ ] **Findings UI grouping**: AVPU (bezvedomie/porucha vedomia), bolesť, dychová tieseň, and
      dehydratácia were each merged into a single 4-state severity control (web-only;
      `discriminatorGroups.ts`). Left as 3 separate toggles: ohrozené dýchacie cesty / apnoe
      (neadekvátne dýchanie) / dychová tieseň (závažná/stredná) — unclear whether clinicians think
      of these as one "breathing problem severity" continuum (like AVPU) or as genuinely separate
      axes (airway patency vs. breathing adequacy vs. work of breathing) that shouldn't be forced
      onto one scale. Confirm with clinicians.
- [ ] Reconcile `docs/spec.md` with the 2026-06-11 agree/disagree flow (still documents the old
      color-verdict + modes design).
- [ ] ~~Decide default flow mode~~ — DROPPED: modes removed in the agree/disagree simplification.

## Env gotchas on this machine (so you don't relearn them)
- npm `allow-scripts` gates native postinstalls: after `npm install`, if a native binary is
  missing, fetch manually — better-sqlite3: run `node node_modules/better-sqlite3 →
  node ../prebuild-install/bin.js`; esbuild: `node node_modules/esbuild/install.js`.
- Corporate McAfee proxy intercepts localhost for CLI tools → use `curl --noproxy '*' -4`.
- Run Vite bound to IPv4 (`--host 127.0.0.1`) so the browser/curl reach it past the proxy.
