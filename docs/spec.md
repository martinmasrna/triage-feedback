# Pediatric Triage-Feedback Tool — Specification (v1.1 — 2026-06-11)

A small Slovak, doctor-facing web tool where pediatric clinicians run mock patient cases through an automated triage system, see what it decided and why, then record whether they agree or disagree with that decision (plus an optional comment). Each saved case is a labeled, critiqued data point used to improve the triage logic.

Not a clinical device. Mock data only, ever.

The frame: the system’s output is a candidate the doctor judges. This is a labeling-and-critique instrument, not “an AI that triages with a comment box.”

— Update 2026-06-11: The doctor no longer assigns their own triage color. The verdict is a simple agree / disagree on the system’s decision plus one optional free-text comment, and the doctor always sees the system result first. This removed the color verdict, the color_reason/system_critique split, the blind-first/informed modes, the anti-anchoring gate, and the derived agreement distance. This version (v1.1) is authoritative.

## Fixed principles (Part A)
- The decider is a deterministic rule set, not the LLM (auditable, reproducible).
- The LLM only reads: narrative → structured findings. It also produces a silently-stored “second opinion” color, never shown as the decision.
- The shown explanation must be the real cause: the list of rules that fired + the decisive one. Never a separately-generated rationale.
- Doctor gives an explicit agree / disagree on the system’s decision + one optional free-text comment. No confidence sliders in v1.
- Store what the system understood (findings) separately from what it decided, so a disagreement is attributable to mis-read (LLM) vs mis-decision (rules).

### Overarching design lens (from planning)
Optimize for fidelity to how a real triage system collects data, not realism-of-thought — because the future AI-powered app will ingest structured intake, so the mock tool must collect data in that same shape (train/serve consistency). This lens also drove the TypeScript choice (the real app will be TS too).

## Step 1 — Purpose & success criteria
- Success = count of attributable disagreements + a measured agreement baseline + coverage across everyday / edge / known-hard / age bands. Not raw case count.
- No attribution — all doctor evaluations treated as equal; no “which doctor” field; inter-rater comparison out of scope. (Likely solo user.)
- Cases come from both a curated seed bank (the coverage instrument: edge, known-hard, deliberate age-band spread) and free improvisation (volume + everyday realism).
- “Enough data” = coverage (every key rule exercised, every age band present, disagreements explained), ~low hundreds of cases.

## Step 2 — Case model
Structured-primary, real-triage-shaped, Manchester Triage System (MTS) vocabulary (5 colors, discriminator names, pediatric vital ranges).

- Age — mandatory, structured, precise (number + unit days/months/years) — for banding
- Vitals — numeric fields, entered directly (no LLM)
- Discriminators / red-flags — tri-state: present / absent / unknown
- Chief complaint — pick-list category + optional free-text refinement
- Triage note — short free text (a sentence or two — not an essay)

LLM reading job (narrowed): read note + complaint to fill blank discriminators and catch vitals mentioned in prose but not typed. Respects negation; returns unknown, never guesses. Doctor’s explicit entries always win.

Flat universal discriminator set — NOT MTS’s complaint-branched flowcharts (the rule model is flat most-urgent-wins; complaint is for context/coverage only). Required minimum to triage: age + complaint + note (vitals/discriminators optional, LLM-fillable).

## Step 3 — Rules & explanation engine
- A rule = named condition over findings/vitals, carrying one color.
- Selection = pure max-color (most-urgent-finding-wins; findings never sum).
- Decisive rule = highest-color rule that fired; ties broken by fixed rule order.
- Explanation = the fired-rules list + decisive rule marked. Nothing generated separately.
- Serial vitals / deterioration: deferred (v1 = single snapshot).
- Clinical content drafted from published standards (APLS/PEWS/MTS), clinician-validated.
  Provisional draft: docs/triage-rules-provisional.md (NEEDS CLINICAL SIGN-OFF).
- Rules stored in an editable YAML file the engine loads — clinicians revise without code changes. Rules carry Slovak display labels for the explanation UI.
- 5-level Manchester colors: RED · ORANGE · YELLOW · GREEN · BLUE.

## Step 4 — LLM role
- Extractor behind a clean, swappable interface.
- Second opinion: yes — independent LLM triage color, stored silently, never shown.
- Provider: local-first (Gemma/Llama-class) — privacy, no per-call cost, generalizes to real patient data, train/serve consistency. Small-model reliability is the known risk.
- No live “case as understood” panel: the doctor sees only the color + fired-rules explanation (which already reveals the decisive findings). The full extraction trace is stored silently; mis-read vs mis-decision is attributed offline. (Rationale: a read-only panel is clutter + anchoring risk and adds nothing offline analysis can’t recover.)
- Validation: offline spot-audit, concentrated on disagreements.

## Step 5 — Doctor’s assessment flow
Rewritten 2026-06-11: Agree / Disagree on the system decision + optional comment, then save. No modes, no doctor-assigned color, no anti-anchoring interlocks.

— End v1.1 —