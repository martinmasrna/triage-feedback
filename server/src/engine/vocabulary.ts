// The single source of truth for the findings the system understands. Both the LLM output
// schema AND the {{discriminator_list}} / {{vital_list}} injected into the prompts are derived
// from here, so they can never drift apart. The rule YAML must only reference keys defined here
// (guarded by a test).

import type { VitalKey } from "./types.js";

export interface DiscriminatorDef {
  key: string;
  label_sk: string;
}

export interface VitalDef {
  key: VitalKey;
  label_sk: string;
  unit: string;
  /** Optional inclusive bounds, enforced by the extraction schema and input validation. */
  min?: number;
  max?: number;
}

export interface CategoryDef {
  key: string;
  label_sk: string;
}

/** Presenting-complaint categories for the pick-list (Step 2). Free-text refinement is separate. */
export const COMPLAINT_CATEGORIES: readonly CategoryDef[] = [
  { key: "respiratory", label_sk: "Dýchacie ťažkosti" },
  { key: "fever", label_sk: "Horúčka" },
  { key: "trauma", label_sk: "Úraz" },
  { key: "gastrointestinal", label_sk: "Tráviace ťažkosti (GI)" },
  { key: "neurological", label_sk: "Neurologické (kŕče, porucha vedomia)" },
  { key: "rash", label_sk: "Vyrážka / kožné" },
  { key: "ent", label_sk: "ORL (uši / nos / hrdlo)" },
  { key: "poisoning", label_sk: "Intoxikácia / otrava" },
  { key: "psychiatric", label_sk: "Náhly psychický stav" },
  { key: "other", label_sk: "Iné" },
];

export const DISCRIMINATORS: readonly DiscriminatorDef[] = [
  { key: "avpu_unresponsive", label_sk: "Bezvedomie (AVPU = U)" },
  { key: "apnoea", label_sk: "Apnoe / neadekvátne dýchanie" },
  { key: "airway_compromise", label_sk: "Ohrozené dýchacie cesty" },
  { key: "active_seizure", label_sk: "Prebiehajúci kŕč (status epilepticus)" },
  { key: "central_cyanosis", label_sk: "Centrálna cyanóza" },
  { key: "non_blanching_rash", label_sk: "Neblednúca (petechiálna/purpurová) vyrážka" },
  { key: "altered_consciousness", label_sk: "Porucha vedomia (AVPU = V alebo P)" },
  { key: "severe_resp_distress", label_sk: "Závažná dychová tieseň (zaťahovanie/grunting)" },
  { key: "moderate_resp_distress", label_sk: "Stredná dychová tieseň / zvýšená dychová práca" },
  { key: "severe_pain", label_sk: "Silná bolesť" },
  { key: "moderate_pain", label_sk: "Stredná bolesť" },
  { key: "immunocompromised", label_sk: "Imunokompromitované / rizikové dieťa" },
  { key: "significant_dehydration", label_sk: "Významná dehydratácia" },
  { key: "moderate_dehydration", label_sk: "Stredná dehydratácia" },
  { key: "on_oxygen", label_sk: "Na kyslíkovej terapii" },
  { key: "pat_appearance_abnormal", label_sk: "PAT: abnormálny vzhľad" },
  { key: "pat_wob_abnormal", label_sk: "PAT: abnormálna dychová práca" },
  { key: "pat_circulation_abnormal", label_sk: "PAT: abnormálna cirkulácia/farba kože" },
  { key: "poor_feeding", label_sk: "Zlé prijímanie tekutín/stravy (dojča)" },
  { key: "reduced_urine_output", label_sk: "Znížené močenie (dojča)" },
];

export const VITALS: readonly VitalDef[] = [
  { key: "hr", label_sk: "Srdcová frekvencia", unit: "/min" },
  { key: "rr", label_sk: "Dychová frekvencia", unit: "/min" },
  { key: "spo2", label_sk: "Saturácia O₂", unit: "%" },
  { key: "temp", label_sk: "Teplota", unit: "°C" },
  { key: "systolic_bp", label_sk: "Systolický krvný tlak", unit: "mmHg" },
  { key: "diastolic_bp", label_sk: "Diastolický krvný tlak", unit: "mmHg" },
  { key: "crt", label_sk: "Kapilárny návrat", unit: "s" },
  { key: "glucose", label_sk: "Glykémia", unit: "mmol/l" },
  { key: "pain_score", label_sk: "Skóre bolesti", unit: "0-10", min: 0, max: 10 },
];

export const DISCRIMINATOR_KEYS: readonly string[] = DISCRIMINATORS.map((d) => d.key);
export const VITAL_KEYS: readonly VitalKey[] = VITALS.map((v) => v.key);

/** Human-readable list of discriminators, injected into prompts as {{discriminator_list}}. */
export function discriminatorListText(): string {
  return DISCRIMINATORS.map((d) => `- ${d.key}: ${d.label_sk}`).join("\n");
}

/** Human-readable list of vitals, injected into prompts as {{vital_list}}. */
export function vitalListText(): string {
  return VITALS.map((v) => `- ${v.key}: ${v.label_sk} (${v.unit})`).join("\n");
}
