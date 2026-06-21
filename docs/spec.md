# Pediatric Triage-Feedback Tool — Specification (v1.4 — 2026-06-21)

A small Slovak, doctor-facing web tool where pediatric clinicians run mock patient cases through an automated triage system, see what it decided and why, then record whether they agree or disagree with that decision (plus an optional comment). Each saved case is a labeled, critiqued data point used to improve the triage logic.

Not a clinical device. Mock data only, ever.

The frame: the system’s output is a candidate the doctor judges. This is a labeling-and-critique instrument, not “an AI that triages with a comment box.”

### Change log
- **v1.4 (2026-06-21)** — seed-bank delivery corrected. There is **no live seed picker and no `GET /api/seeds`** (the v1.3 plan was not kept). Seeds in `server/seeds/seeds.yaml` are loaded by the `seed-cases.ts` script, which runs each through the live extractor + engine and stores it as a pending `ai_generated` case (`verdict: null`), skipping already-seeded ids on re-run. These surface in the sidebar's "Na posúdenie" queue and are reviewed like any other case. The seed YAML shape, validation (`domain/seeds.ts`), and coverage tags (`intent`/`expected_color`/`expected_rule`) are unchanged.
- **v1.3 (2026-06-15)** — the curated **seed bank is now wired in**: seed cases live in `server/seeds/seeds.yaml` (EnteredCase shape + optional `intent` label and `expected_color`/`expected_rule` coverage tags), are served read-only at **`GET /api/seeds`**, and a picker on entry-screen step 1 loads one into the wizard. A loaded seed pre-fills the whole form but the decision is still taken live; on *Ďalej* the extractor reads the note and **merges** its findings into the form, filling only gaps (seed/doctor values win). The same merge now also protects manual edits across back/forward navigation.
- **v1.2 (2026-06-15)** — three behavioural changes, integrated below:
  1. The LLM reads the note **up front** and **pre-fills** the vitals and findings forms (was: read silently at the end). The doctor reviews and edits pre-filled values; the form is authoritative for the decision.
  2. The doctor’s verdict is **editable on past cases** (agree/disagree *and* comment), reversing the earlier immutability. A silent flag records whether a verdict was ever changed.
  3. `pain_score` may be **inferred from descriptive words** (verbal rating scale); all other vitals stay number-only.
- **v1.1 (2026-06-11)** — the doctor no longer assigns their own triage color. The verdict became a simple agree/disagree on the system’s decision plus one optional comment, and the doctor always sees the system result first. This removed the color verdict, the color_reason/system_critique split, the blind-first/informed modes, the anti-anchoring gate, and the derived agreement distance.

## Fixed principles (Part A)
- **The decider is a deterministic rule set, not the LLM** (auditable, reproducible).
- **The LLM only reads**: narrative → structured findings. It never decides the shown color. It also produces a silently-stored “second opinion” color, kept for analysis and never shown.
- **The shown explanation must be the real cause**: the list of rules that fired + the decisive one. Never a separately-generated rationale.
- **The doctor judges the system’s decision**: an explicit agree / disagree + one optional free-text comment. No doctor-assigned color, no confidence sliders.
- **Store what the system understood (findings) separately from what it decided**, so a disagreement is attributable to mis-read (LLM) vs mis-decision (rules).

### Overarching design lens (from planning)
Optimize for fidelity to how a real triage system collects data, not realism-of-thought — because the future AI-powered app will ingest structured intake, so the mock tool must collect data in that same shape (train/serve consistency). This lens also drove the TypeScript choice (the real app will be TS too).

## Step 1 — Purpose & success criteria
- Success = count of attributable disagreements + a measured agreement baseline + coverage across everyday / edge / known-hard / age bands. Not raw case count.
- No attribution — all doctor evaluations treated as equal; no “which doctor” field; inter-rater comparison out of scope. (Likely solo user.)
- Cases come from both a curated seed bank (the coverage instrument: edge, known-hard, deliberate age-band spread) and free improvisation (volume + everyday realism).
- “Enough data” = coverage (every key rule exercised, every age band present, disagreements explained), ~low hundreds of cases.

## Step 2 — Case model
Structured-primary, real-triage-shaped, Manchester Triage System (MTS) vocabulary (5 colors, discriminator names, pediatric vital ranges).

- **Age** — mandatory, structured, precise (number + unit days/months/years) — for banding.
- **Vitals** — numeric fields. The doctor may type them; the LLM may also pre-fill them from the note (see Step 5).
- **Discriminators / red-flags** — tri-state: present / absent / unknown. Doctor-set or LLM-pre-filled.
- **Chief complaint** — pick-list category + optional free-text refinement.
- **Triage note** — short free text (a sentence or two — not an essay). This is the LLM’s only input.

The required minimum to triage is age + complaint + note; vitals and discriminators are optional (the LLM fills what it can from the note, the doctor adjusts).

Flat universal discriminator set — NOT MTS’s complaint-branched flowcharts (the rule model is flat most-urgent-wins; complaint is for context/coverage only).

### Findings provenance (the core data contract)
Every saved case keeps three views of the findings distinct:
- **`entered`** — exactly what is in the form at evaluate time. The form may have started as LLM pre-fill; whatever the doctor leaves or edits becomes `entered`.
- **`extraction`** — the **original** structured findings the LLM read from the note, stored verbatim and never overwritten by the doctor’s edits.
- **`effective`** — the findings the engine actually decided on (see Step 5).

Comparing `entered` against `extraction` is what makes a disagreement attributable to a mis-read (the LLM read something different) vs a mis-decision (the rules acted wrongly on agreed findings). There is no visual distinction in the UI between a value the doctor typed and one the LLM pre-filled — the separation lives only in the stored record.

## Step 3 — Rules & explanation engine
- A rule = named condition over findings/vitals, carrying one color.
- Selection = pure max-color (most-urgent-finding-wins; findings never sum).
- Decisive rule = highest-color rule that fired; ties broken by fixed rule order (YAML file order).
- Unknown/missing data never satisfies a numeric condition — the engine never guesses.
- Explanation = the fired-rules list + decisive rule marked. Nothing generated separately.
- Serial vitals / deterioration: deferred (v1 = single snapshot).
- Clinical content drafted from published standards (APLS/PEWS/MTS), clinician-validated. Provisional draft: `docs/triage-rules-provisional.md` (NEEDS CLINICAL SIGN-OFF).
- Rules stored in an editable YAML file (`server/rules/triage-rules.yaml`) the engine loads — clinicians revise without code changes. Rules carry Slovak display labels for the explanation UI.
- 5-level Manchester colors: RED · ORANGE · YELLOW · GREEN · BLUE.

## Step 4 — LLM role
- Extractor behind a clean, swappable interface (`LlmClient`); runs against a local llama.cpp server over the OpenAI-compatible API, with schema-constrained JSON output. `StubReader` fallback when no model is configured.
- **Reading is fail-safe**: extraction never throws — on any failure it yields “could not read” and the pipeline continues on whatever structured fields exist. A model being down can’t skew or block triage.
- **Second opinion: yes** — an independent LLM triage color, stored silently, never shown. For later “would LLM-as-decider beat the rules?” analysis. Computed at evaluate time, when it can see the full reviewed case.
- **Provider: local-first** (Gemma/Llama-class) — privacy, no per-call cost, generalizes to real patient data, train/serve consistency. Small-model reliability is the known risk.
- **Validation: offline spot-audit**, concentrated on disagreements.

### Pain score: the one inference exception
The strict “return a number only if a number is stated; never invent one from words” rule holds for every vital **except `pain_score`**. Pain is genuinely communicated on a verbal rating scale, so the extractor maps qualitative descriptors to a representative 0–10 value (mierna → 2, stredne silná → 5, silná → 8, neznesiteľná/krutá/najhoršia → 10). An explicit numeric score always wins; unmentioned pain stays null. This is scoped to pain only — temperature, HR, etc. are never inferred from adjectives.

## Step 5 — Case-entry flow & the doctor’s assessment
A four-step wizard (Slovak): **1 Basic info → 2 Vitals → 3 Findings → 4 Result & assessment.**

- **Step 1 — Basic info**: age, complaint category (+ optional refinement), triage note.
- **Step 1 → 2 — extraction & pre-fill**: clicking *Ďalej* reads the note (blocking spinner, “Čítam záznam…”) and **pre-fills the vitals (step 2) and discriminators (step 3)**. The note is read once; it is re-read only if the note or complaint changed, so navigating back and forth never clobbers the doctor’s edits. A read failure is non-blocking — the doctor fills the form by hand and step 4 flags that the note couldn’t be read.
- **Steps 2 & 3 — review/edit**: the doctor confirms or changes the pre-filled values. These are optional fields; the LLM has already filled what it found.
- **Step 4 — result & verdict**: the engine runs and the result (color + fired-rules explanation) is shown, with an agree / disagree control and an optional comment.

### Decision authority: the form wins
Because the doctor has already reviewed the pre-filled form, **the decision is computed on `entered` (the form) directly** — the original `extraction` is stored only as the research record, not merged back in. This means a doctor who **clears or changes** a pre-filled value genuinely overrides the LLM, including clearing a value to blank. (`effective` therefore equals `entered` in the normal pre-fill flow. A legacy/no-pre-fill path still merges extraction under the entered form, doctor-wins, to fill gaps — but the live flow always pre-fills.)

### Editing a saved verdict
The verdict is **not** frozen at the moment of review: revisiting a saved case lets the doctor revise the agree/disagree **and/or** the comment. To keep this honest for analysis, a **silent `verdict_changed` flag** records whether a revision ever changed the agree/disagree (sticky — it stays true even if later flipped back; comment-only edits don’t set it). It is stripped from the doctor-facing API and surfaced only in the admin record and exports. There is no full revision history — only the “was it ever changed” bit and the current value.

## Step 6 — Stored record & export
A saved case bundles: inputs as entered (age, complaint cat+text, note, vitals, discriminators) · the original extraction trace (kept distinct from entered) · effective findings · decision (color + full fired-rules list + decisive rule) · silent LLM second-opinion color · doctor verdict (agree/disagree + comment) · the silent `verdict_changed` flag · full provenance (rule-set version, model id, extraction & second-opinion prompt versions, timestamps).

Two doctor-facing/admin boundaries:
- **Doctor API** (`/api/cases*`) returns a stripped projection — no second opinion, no extraction trace, no effective findings, no model provenance, no `verdict_changed`.
- **Admin API + exports** return the full record. Export = both JSON (canonical, lossless) + CSV (flattened for spreadsheets/stats, including a `verdict_changed` column).

## Step 7 — Stack & deployment
TypeScript throughout (train/serve consistency with the future real app).
- **Frontend**: plain Vue 3 + Vite + TS + vue-router; hand-rolled CSS on Tailwind (semantic classes via @apply); Slovak.
- **Backend**: Node 22 (ESM, TS) + Hono. `createApp({ store, reader, ruleSet })` is dependency-injected and testable.
- **Storage**: SQLite (full StoredCase as JSON + lifted columns for filtering); `InMemoryCaseStore` for dev/tests.
- **Model**: llama.cpp HTTP server (OpenAI-compatible), schema-constrained output, behind the swappable extractor interface.
- **Rules**: clinician-editable YAML with Slovak display labels.
- **Deployment**: single local/internal host (on-prem shape the real app will need). In prod the server also serves the built Vue files; `/admin` UI and admin API are gated.
- **Offline analysis** is decoupled — done in Python/R on the exported JSON/CSV, not in-app.

## Step 8 — UI
Slovak, doctor-facing, minimal. The stepped wizard above; colors + rule-explanation labels in Slovak. Saved-cases list = all cases, filterable (e.g. disagreements only), with JSON + CSV export. LLM-can’t-read handling: a plain Slovak banner, flow continues on the structured fields.

— End v1.2 —
