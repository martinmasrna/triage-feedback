# Provisional triage rule set (v0.1 DRAFT)

> ⚠️ **NEEDS CLINICAL SIGN-OFF.** Every value below is drafted from published pediatric
> standards (APLS, PEWS, Manchester Triage System pediatric discriminators) as a *starting
> point for clinicians to red-line*. It is **not** validated clinical content and must not be
> used for any real triage. Mock research data only. Expect revision from clinicians and from
> the data this tool collects.

## Colors (Manchester scheme)

| Color | Meaning | Spirit |
|-------|---------|--------|
| RED | Immediate | life-threatening |
| ORANGE | Very urgent | ~10 min |
| YELLOW | Urgent | ~60 min |
| GREEN | Standard | routine |
| BLUE | Non-urgent | minor |

**Selection = pure max-color (most-urgent-finding-wins).** A case's color is the highest color
among all rules that fired. Findings never sum. The **decisive rule** is the highest-color rule
that fired; ties broken by the fixed rule order in this file (most dangerous listed first).

## Age bands (APLS-style) — VALIDATE

| Band | Age range |
|------|-----------|
| Neonate | 0–28 days |
| Infant | 29 days – <1 year |
| Toddler | 1 – <2 years |
| Preschool | 2 – <5 years |
| School-age | 5 – <12 years |
| Adolescent | 12 – 18 years |

## Normal vital ranges by band (awake) — VALIDATE

Heart rate (bpm) and respiratory rate (breaths/min) "normal" windows; values outside trigger
the tachy/brady and tachypnea rules below.

| Band | HR normal | RR normal | Diastolic BP normal |
|------|-----------|-----------|----------------------|
| Neonate | 100–180 | 40–60 | 30–55 |
| Infant | 110–160 | 30–40 | 35–65 |
| Toddler | 100–150 | 25–35 | 40–68 |
| Preschool | 95–140 | 25–30 | 45–72 |
| School-age | 80–120 | 20–25 | 50–78 |
| Adolescent | 60–100 | 12–20 | 55–85 |

Minimum acceptable systolic BP ≈ **70 + (2 × age in years)**; neonate ≥ ~60. Below → shock rule.

Diastolic BP outside the band's normal window → diastolic hypotension/hypertension rules below.

## Red-flag floor — always escalate (RED unless noted)

These are the safety floor; if any fires, the case is at least the stated color regardless of
everything else.

1. **Unresponsive** (AVPU = U) → RED
2. **Apnoea / inadequate breathing** → RED
3. **Airway compromise** (stridor at rest with distress, drooling + distress) → RED
4. **Signs of shock** (prolonged cap refill ≥3s + tachycardia, or SBP below minimum) → RED
5. **Active/continuous seizure (status)** → RED
6. **Central cyanosis** or **SpO₂ < 90%** → RED
7. **Non-blanching (petechial/purpuric) rash + unwell** → RED
8. **Fever in neonate / infant < 3 months** → ORANGE (sepsis risk) — VALIDATE threshold

## Vital-derived rules (provisional colors) — VALIDATE

| Rule name | Condition | Color |
|-----------|-----------|-------|
| Severe hypoxia | SpO₂ < 90% | RED |
| Moderate hypoxia | SpO₂ 90–94% | ORANGE |
| Hypotension for age | SBP < band minimum | RED |
| Severe tachycardia for age | HR > band-normal upper × ~1.3 | ORANGE |
| Tachycardia for age | HR > band-normal upper | YELLOW |
| Bradycardia for age | HR < band-normal lower | ORANGE |
| Severe tachypnea for age | RR > band-normal upper × ~1.3 | ORANGE |
| Tachypnea for age | RR > band-normal upper | YELLOW |
| Diastolic hypotension for age | Diastolic BP < band-normal lower | YELLOW |
| Diastolic hypertension for age | Diastolic BP > band-normal upper | YELLOW |
| Prolonged capillary refill | CRT ≥ 3 s | ORANGE |
| High fever | Temp ≥ 40.0 °C | YELLOW |
| Fever | Temp ≥ 38.0 °C | GREEN/YELLOW (age-dependent) |
| Hypothermia | Temp < 36.0 °C | ORANGE |
| Hypoglycemia | Glucose < 3.0 mmol/L | ORANGE |

## Discriminator-derived rules (clinical findings) — VALIDATE

| Rule name | Color |
|-----------|-------|
| Altered conscious level (AVPU = V or P) | ORANGE |
| Severe respiratory distress (marked retractions / grunting / nasal flaring) | ORANGE |
| Moderate respiratory distress / increased work of breathing | YELLOW |
| Severe pain | ORANGE |
| Moderate pain | YELLOW |
| Significant dehydration | ORANGE |
| Moderate dehydration | YELLOW |
| Immunocompromised / high-risk history + unwell | ORANGE |
| Minor complaint, normal vitals, no red flags | GREEN |
| Trivial / non-urgent | BLUE |

## New data fields (oxygen, PAT discriminators, infant hydration, pain score)

Each new discriminator is tri-state (`present` / `absent` / `unknown`, default `unknown`).

- **on_oxygen** — the child is currently receiving supplemental oxygen (nasal cannula, mask,
  HFNC, CPAP/BiPAP, or ventilator). `absent` means explicitly on room/ambient air.
- **pat_appearance_abnormal** — Pediatric Assessment Triangle: appearance abnormal (poor tone,
  not interacting, lethargic, inconsolable).
- **pat_wob_abnormal** — PAT: work of breathing abnormal (tachypnea, retractions, nasal
  flaring, grunting).
- **pat_circulation_abnormal** — PAT: circulation/skin abnormal (pallor, mottling, cyanosis,
  cool peripheries).
- **poor_feeding** — caregiver reports poor intake in an infant.
- **reduced_urine_output** — fewer wet diapers / markedly reduced urine output in an infant.
- **pain_score** — numeric vital, 0–10. Only recorded if a number is explicitly stated; never
  inferred from descriptive words.

### SpO₂ rules and oxygen

The existing SpO₂ rules (`severe_hypoxia`, `moderate_hypoxia`) are now labeled "— na vzduchu"
(on room air) and only fire when `on_oxygen` is `absent`. A new rule, `hypoxemia_on_oxygen`
(ORANGE), fires when `on_oxygen` is `present` and SpO₂ < 92%, covering hypoxemia despite
oxygen therapy. If `on_oxygen` is `unknown`, none of these three SpO₂ rules fire.

### New rules added

| Rule name | Condition | Color |
|-----------|-----------|-------|
| shock_pat_circ_crt | pat_circulation_abnormal + CRT ≥ 3s | RED |
| shock_pat_circ_hypotension | pat_circulation_abnormal + SBP below band minimum | RED |
| ill_appearance | pat_appearance_abnormal | ORANGE |
| hypoxemia_on_oxygen | on_oxygen + SpO₂ < 92% | ORANGE |
| infant_poor_feeding | age < 6 months + poor_feeding | ORANGE |
| infant_reduced_urine | age < 6 months + reduced_urine_output | ORANGE |
| severe_pain | pain_score ≥ 7 | ORANGE |
| moderate_pain | pain_score 4–6 | YELLOW |

## Explanation contract

Whatever the engine outputs, the shown explanation = **the list of rules that fired + the
decisive one marked**. No separately generated prose. The "case as understood" view shows the
findings the engine consumed, distinguishing doctor-entered from LLM-filled.
