# TODO — next session

Status: full stack built and working (server: 89 tests green; Vue UI runs, verified). Backend = engine + LLM reader (real model, StubReader fallback) + SQLite store + export + Hono API. See docs/spec.md (v1.2) for design, README.md to run. This file = the agreed next-session work.

> Flow simplified 2026-06-11 (user’s team). The doctor no longer assigns a triage color — the verdict is a simple agree / disagree + one optional comment, and the doctor always sees the system result first. See docs/spec.md change log for the full list of what that removed.

## Recently done (2026-06-15) — see docs/spec.md v1.2
- **Extraction moved up-front + pre-fills the form.** New `POST /api/extract` reads the note on step 1→2 and pre-fills vitals/discriminators; the decision is taken on the doctor’s reviewed form (form authoritative, clearing a value wins); the original extraction is still stored as the research record.
- **Editable verdicts.** `PATCH /api/cases/:id` now edits the agree/disagree as well as the comment.
- **Silent `verdict_changed` flag** on the stored record (sticky; admin/export only; new CSV column).
- **`pain_score` inferred from words** (verbal rating scale); extraction prompts bumped 0.1.0 → 0.2.0 (en+sk).

---

## 1. Add seed data (~30 cases)
Coverage instrument: the cases improvisation misses. Target ~30: ~9 red-flag floor · ~8 age-banded-vital demos across bands · ~6 edge/ambiguous · ~4 known-hard · ~3 well/everyday — covering all 6 age bands and all 10 complaint categories.
- [ ] Decide the load mechanism (not built yet): a server/seeds/seeds.yaml + an API endpoint (GET /api/seeds) + a “load seed case” picker on the entry screen that pre-fills the form.
- [ ] Author the ~30 cases: each = age + complaint + rich Slovak note (so it also exercises the extractor) + optional vitals/findings. Optional expected_color/expected_rule tag for coverage tracking (NOT the doctor’s verdict — the doctor still agrees/disagrees per case).
- [ ] Send seed content to clinicians for review (like the rules).

## 2. Decide color scale policy
  - Choose between 4-level (RED/ORANGE/YELLOW/GREEN) and 5-level (add BLUE).
  - If 5-level, define BLUE scope (which minor complaints qualify) and whether default_color becomes BLUE. Create a follow-up ticket to implement after the decision.

## 3. Finalize new rules/policies
- Finalize policy on SpO2 interpretation
  - Confirm room-air SpO2 rules will explicitly require on_oxygen = absent.
  - Confirm “hypoxemia_on_oxygen” applies to any supplemental O2 and agree on the <92% threshold (or specify an alternative).

- Define operational criteria for new discriminators
  - PAT appearance/work of breathing/circulation: concrete examples for present / absent / unknown.
  - Infant hydration: define “poor_feeding” and “reduced_urine_output” with practical examples (e.g., diaper counts or caregiver phrasing).

- Non-blanching rash policy
  - Decide: unconditional RED vs RED only when “ill-appearing.” Document choice for future rule adjustment if needed.

- Immunocompromised specificity review
  - Review sample vignettes to ensure targeted immunocompromised rules avoid over-triage yet catch concerning cases; note threshold tweaks if required.

- Rule order audit
  - Verify most dangerous RED rules appear first; confirm intended tie-breaks within each color after inserting new rules.

## 4. Tech debt
- [x] **Fixed the 2 pre-existing test failures** (not feature-related): `makeApp()` in `server/test/api.test.ts` now passes `adminEnabled` for the “admin endpoints expose the full record” and “export.csv/json” suites, which previously hit the disabled-admin 404. All 89 tests green.
- [ ] **Consider an `updated_at` / revision count** if post-hoc verdict edits need a fuller audit trail than the current single `verdict_changed` bit.

## 5. Clinician sign-offs
- [ ] Clinical sign-off on docs/triage-rules-provisional.md — the one true blocker for real use.
- [ ] - Translation/terminology QA (Slovak labels) -- Native Slovak clinical review of new/edited label_sk strings for clarity and consistency.
- [ ] fever ≥ 38 → YELLOW was encoded but flagged ambiguous in the draft rules — confirm with clinicians.
- [ ] Findings UI grouping: AVPU (bezvedomie/porucha vedomia), bolesť, dychová tieseň, and dehydratácia were each merged into a single 4-state severity control (web-only; discriminatorGroups.ts). Left as 3 separate toggles: ohrozené dýchacie cesty / apnoe (neadekvátne dýchanie) / dychová tieseň (závažná/stredná) — unclear whether clinicians think of these as one “breathing problem severity” continuum (like AVPU) or as genuinely separate axes (airway patency vs. breathing adequacy vs. work of breathing) that shouldn’t be forced onto one scale. Confirm with clinicians.