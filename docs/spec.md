# Pediatric Triage-Feedback Tool — Specification (v1)

A small Slovak, doctor-facing web tool where pediatric clinicians run **mock** patient cases
through an automated triage system, see what it decided and why, then record whether they
**agree or disagree** with that decision (plus an optional comment). Each saved case is a
labeled, critiqued data point used to improve the triage logic. **Not a clinical device. Mock
data only, ever.**

The frame: **the system's output is a candidate the doctor judges.** This is a
labeling-and-critique instrument, not "an AI that triages with a comment box."

> **⚠️ Flow simplified 2026-06-11 (user's team).** The doctor no longer assigns their own triage
> color. The verdict is a simple **agree / disagree** on the system's decision + one optional
> free-text comment, and the doctor always sees the system result first. This removed the
> color verdict, the `color_reason`/`system_critique` split, the blind-first/informed **modes**,
> the anti-anchoring gate, and the derived **agreement** distance. Steps 5, 6 and 8 below and the
> 2026-06-10 addendum are updated/annotated accordingly; **the 2026-06-11 addendum is authoritative.**

---

## Fixed principles (Part A)

- The decider is a **deterministic rule set**, not the LLM (auditable, reproducible).
- The **LLM only reads**: narrative → structured findings. It also produces a silently-stored
  "second opinion" color, never shown as the decision.
- The shown explanation must be the **real cause**: the list of rules that fired + the
  decisive one. Never a separately-generated rationale.
- Doctor gives an **explicit agree / disagree** on the system's decision + one optional
  free-text comment. *(Amended 2026-06-11; was "color + free-text reason, agreement derived from
  colors." The team chose the simplest possible feedback gesture.)* No confidence sliders in v1.
- Store **what the system understood (findings)** separately from **what it decided**, so a
  disagreement is attributable to **mis-read** (LLM) vs **mis-decision** (rules).

### Overarching design lens (from planning)
Optimize for **fidelity to how a real triage system collects data**, not realism-of-thought —
because the future AI-powered app will ingest structured intake, so the mock tool must collect
data in that same shape (**train/serve consistency**). This lens also drove the TypeScript
choice (the real app will be TS too).

---

## Step 1 — Purpose & success criteria
- **Success** = count of **attributable disagreements** + a measured agreement baseline +
  coverage across everyday / edge / known-hard / age bands. *Not* raw case count.
- **No attribution** — all doctor evaluations treated as equal; no "which doctor" field;
  inter-rater comparison out of scope. (Likely solo user.)
- Cases come from **both** a curated **seed bank** (the coverage instrument: edge, known-hard,
  deliberate age-band spread) and **free improvisation** (volume + everyday realism).
- "Enough data" = coverage (every key rule exercised, every age band present, disagreements
  explained), ~low hundreds of cases.

## Step 2 — Case model
Structured-primary, real-triage-shaped, **Manchester Triage System (MTS)** vocabulary
(5 colors, discriminator names, pediatric vital ranges).

| Element | Form |
|---|---|
| Age | **Mandatory**, structured, precise (number + unit days/months/years) — for banding |
| Vitals | Numeric fields, entered directly (no LLM) |
| Discriminators / red-flags | **Tri-state: present / absent / unknown** |
| Chief complaint | Pick-list category **+ optional free-text refinement** |
| Triage note | Short free text (a sentence or two — not an essay) |

- **LLM reading job (narrowed)**: read note + complaint to fill *blank* discriminators and
  catch vitals mentioned in prose but not typed. Respects negation; returns "unknown", never
  guesses. **Doctor's explicit entries always win.**
- Flat **universal** discriminator set — NOT MTS's complaint-branched flowcharts (the rule
  model is flat most-urgent-wins; complaint is for context/coverage only).
- Required minimum to triage: **age + complaint + note** (vitals/discriminators optional,
  LLM-fillable).

## Step 3 — Rules & explanation engine
- A **rule** = named condition over findings/vitals, carrying one color.
- **Selection = pure max-color** (most-urgent-finding-wins; findings never sum).
- **Decisive rule** = highest-color rule that fired; ties broken by fixed rule order.
- **Explanation** = the fired-rules list + decisive rule marked. Nothing generated separately.
- **Serial vitals / deterioration: deferred** (v1 = single snapshot).
- **Clinical content** drafted from published standards (APLS/PEWS/MTS), clinician-validated.
  Provisional draft: `docs/triage-rules-provisional.md` (**NEEDS CLINICAL SIGN-OFF**).
- **Rules stored in an editable YAML file** the engine loads — clinicians revise without code
  changes. Rules carry **Slovak display labels** for the explanation UI.
- 5-level Manchester colors: RED · ORANGE · YELLOW · GREEN · BLUE.

## Step 4 — LLM role
- Extractor behind a **clean, swappable interface**.
- **Second opinion: yes** — independent LLM triage color, stored silently, never shown.
- **Provider: local-first** (Gemma/Llama-class) — privacy, no per-call cost, generalizes to
  real patient data, train/serve consistency. Small-model reliability is the known risk.
- **No live "case as understood" panel** (adjusts a Part A item — *principle kept, mechanism
  changed*): the doctor sees only the color + fired-rules explanation (which already reveals
  the *decisive* findings). The full extraction trace is **stored silently**; mis-read vs
  mis-decision is attributed **offline**. (Rationale: a read-only panel is clutter + anchoring
  risk and adds nothing offline analysis can't recover.)
- **Validation: offline spot-audit**, concentrated on disagreements.

## Step 5 — Doctor's assessment flow
> **Rewritten 2026-06-11.** The original design (switchable blind-first/informed *modes*, a
> doctor-assigned color, color-comparison agreement, and a required disagreement critique) was
> **dropped for simplicity.** The historical rationale lives in git history + the planning memory.

- **Single linear flow, no modes:** enter case → **system evaluates → shows its color + the
  fired-rules explanation** → doctor records **Agree / Disagree** → optional comment → save.
  The doctor always sees the system result first (anchoring is accepted, not engineered against).
- **Verdict = `{ agrees: boolean, comment?: string }`.** The agree/disagree is required; the
  comment is **optional even on disagreement** (revisit if "disagree, no reason" proves useless).
- **Comment prompt = light nudge** (free-text, no checkboxes): "Explanation of your assessment —
  especially on disagreement: did the system misread the case or apply the wrong rule?"
- No doctor color, no derived agreement distance. The datapoint is the boolean judgment of the
  system's decision; the system's own color is already stored.

## Step 6 — Data capture & export
One stored case record:
- **Inputs as entered**: age · complaint category + text · note · doctor vitals · doctor
  discriminators (tri-state)
- **Extraction trace** (silent): LLM-filled discriminators + prose-extracted vitals, kept
  **distinct from doctor-entered**
- **Decision**: color · full fired-rules list · decisive rule
- **Second opinion**: LLM's silent independent color
- **Doctor verdict**: **agrees (boolean) · optional comment** *(2026-06-11; was color · reason ·
  mode flag)*
- **Provenance**: timestamps · **rule-set version · model id/version** (full provenance — makes
  cases reproducible & longitudinally comparable as rules and models evolve). *(No derived
  agreement / mode fields — both removed 2026-06-11.)*
- **Export**: **both JSON (canonical, lossless) + CSV (flattened for spreadsheets/stats)**. CSV
  verdict columns: `doctor_agrees`, `doctor_comment`.

## Step 7 — Stack, storage, deployment
- **TypeScript** throughout (reuse into the real TS app).
- **Plain Vue (Vite) front end** — what the user already knows; no meta-framework — **plus a
  tiny Node/TS backend** (Hono or Express) for the server-y work: SQLite read/write, llama.cpp
  calls, loading the YAML rules, and JSON/CSV export. Two processes in dev; in production the
  small server also serves the built Vue static files (one process). *(Nuxt was considered but
  rejected for simplicity — too many new conventions for a Vue user who wants minimal.)*
- **SQLite** (better-sqlite3 or Drizzle) — a real DB file on the host (durable, backup-able,
  feeds the offline Python analysis). Not browser storage.
- **llama.cpp HTTP server** (OpenAI-compatible), JSON-schema/grammar-constrained output for
  reliable structured extraction, behind the swappable extractor interface.
- **YAML** rules file.
- **Single local/internal host** (no external exposure; the on-prem shape the real app needs).
- Offline statistical analysis is **decoupled** — done in Python/R on the export.

## Step 8 — UI
- Slovak, doctor-facing, minimal. **Stepped wizard**, one phase per screen:
  *enter case → vitals → findings → system result + agree/disagree → saved.* *(2026-06-11: no
  blind gate / mode reordering — the result step evaluates on arrival and shows the verdict
  controls.)*
- Colors + rule explanation labels in **Slovak**.
- **Saved-cases list = all cases, filterable** (disagreements only) + export under the admin view.
- **LLM-can't-read handling**: plain Slovak banner ("Systém nedokázal spoľahlivo prečítať
  poznámku"); flow continues on structured fields (unread discriminators = "unknown"; engine
  still runs).

---

## Open items before / during build
1. **Clinical sign-off** on `docs/triage-rules-provisional.md` (age bands, vital ranges,
   red-flag floor, rule→color mappings). Can proceed in parallel.
2. **Seed case bank** content — author mock cases covering edge / known-hard / age-band spread.
3. **Local model selection & reliability check** — pick the specific Gemma/Llama-class model;
   benchmark extraction (the swappable interface makes this safe).
4. ~~**Default flow mode**~~ — DROPPED 2026-06-11: flow modes removed (single agree/disagree flow).

---

## Addendum — UI redesign & access model (2026-06-10)

Changes made during the visual/UX overhaul that refine the steps above. Where these conflict
with the original text, **the addendum wins**.

### Doctor verdict: two text fields (refines Steps 5 & 6) — ⚠️ SUPERSEDED 2026-06-11
> This two-field design (`color_reason` + `system_critique`) was **removed** when the verdict
> became a simple agree/disagree. Kept here only as a record. See the 2026-06-11 addendum below.

### Doctor ↔ admin access model (refines Step 8) — NEW
Two audiences, **separated at the API boundary, no authentication** (trust-based, single internal
host). The split exists because doctors must never see the silent **second opinion** / extraction
trace (anchoring risk + analysis-only data).
- **Doctor API** (`GET /api/cases`, `/api/cases/:id`, `PATCH /api/cases/:id`) returns a stripped
  `DoctorCase` — **omits** second opinion, extraction trace, effective findings, and model/prompt
  provenance. The server never serializes those to a doctor.
- **Admin/research API** (`GET /api/admin/cases`, `/api/admin/cases/:id`) returns the full
  `StoredCase`. **Exports moved here**: `GET /api/admin/export.json|csv`.
- **Web routes**: doctor `/`, `/cases`, `/cases/:id`; admin `/admin/cases`, `/admin/cases/:id`
  (reachable by URL only — not in the doctor nav). *(2026-06-11: the flow-mode toggle is gone —
  there are no modes.)*
- Mock/seed-case upload (Open item #2) is **not built yet**; the doctor list is structured to
  accept a future "pending cases to assess" section.

### UI shell
Tailwind CSS v4 design system. New Case is a **4-step wizard** (Základné údaje · Vitálne funkcie ·
Klinické nálezy · Zhrnutie a hodnotenie); the 14 discriminators are grouped into clinical sections
(presentational only — the engine vocabulary stays the single source of truth for keys).

---

## Addendum — agree/disagree verdict + visual redesign (2026-06-11) — AUTHORITATIVE

Where this conflicts with anything above, **this wins.**

### Verdict → agree / disagree (supersedes the 2026-06-10 two-field verdict)
- The doctor no longer assigns a triage color. **Verdict = `{ agrees: boolean, comment?: string }`.**
- Flow: enter case → **system evaluates on entering step 4 → shows color + fired-rules
  explanation** → doctor clicks **„Súhlasím" / „Nesúhlasím"** → optional comment → save. Going
  back to edit and re-entering step 4 simply re-evaluates. The doctor sees the system first.
- **Removed entirely:** doctor color + the color picker; `color_reason` / `system_critique`; the
  blind-first / informed **modes** (and the mode setting/toggle); the anti-anchoring back-block;
  the derived **agreement** (same / off-by-one / off-by-two-plus).
- **Editing a saved case:** only the `comment` (via `PATCH /api/cases/:id`); `agrees` is immutable.
- **Storage/export:** SQLite lifts `system_color` + `agrees`; CSV verdict columns are
  `doctor_agrees`, `doctor_comment`. Doctor list filter = **disagreements-only**.
- **Open (by design, user spec):** the comment is optional even on disagreement. Making it
  required is a one-line zod `.refine` + a `canSave` tweak if data quality needs it.
- **Cost accepted:** without a doctor color there is no disagreement *direction* or *magnitude*
  in the data — only the boolean. Recover finer signal later from the comment text if needed.

### Visual design (refines Step 8 "UI shell")
- **"Clinical Calm" palette:** primary = **teal `#0e8a8a`** (still clears all five triage
  colors), warmed slate-teal neutrals, **Plus Jakarta Sans**. Triage chips keep MTS colors;
  yellow uses dark text.
- **Sidebar app-shell:** the top header is replaced by a deep teal-slate sidebar (`App.vue`) —
  brand, "Nový prípad", and a collapsible **recent-cases** list (system-color dot · `age ·
  complaint` · relative time); a breadcrumb topbar in the content panel. Step-1 ergonomics:
  segmented age-unit toggle, dimmed-until-valid primary button. Static mock-ups of the chosen
  direction are in `mockups/`.
