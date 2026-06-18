// Core types for the deterministic triage rule engine.
//
// Design (locked in planning):
//  - A rule is a named condition over findings/vitals, carrying ONE color.
//  - Selection is pure max-color: a case's color = the highest color among all fired rules.
//    Findings never sum.
//  - The decisive rule = the highest-color rule that fired; ties are broken by file order
//    (rules are listed most-dangerous-first within a color in the YAML).
//  - The explanation IS the list of fired rules + the decisive one. Nothing is generated
//    separately. This module returns that structure; the UI renders it.

export type Color = "RED" | "ORANGE" | "YELLOW" | "GREEN" | "BLUE";

/** Higher number = more urgent. Used for max-color selection and tie context. */
export const COLOR_PRIORITY: Record<Color, number> = {
  RED: 5,
  ORANGE: 4,
  YELLOW: 3,
  GREEN: 2,
  BLUE: 1,
};

export const COLORS: readonly Color[] = ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"];

export type AgeUnit = "days" | "months" | "years";
export interface Age {
  value: number;
  unit: AgeUnit;
}

/** Vitals the engine understands. A missing value means "unknown" — numeric rules cannot fire on it. */
export type VitalKey =
  | "hr" // heart rate, bpm
  | "rr" // respiratory rate, breaths/min
  | "spo2" // oxygen saturation, %
  | "temp" // temperature, °C
  | "systolic_bp" // systolic blood pressure, mmHg
  | "diastolic_bp" // diastolic blood pressure, mmHg
  | "crt" // capillary refill time, seconds
  | "glucose" // blood glucose, mmol/L
  | "pain_score"; // self/observer-reported pain, 0–10

export const VITAL_VS_BAND_KEYS = ["hr", "rr", "systolic_bp", "diastolic_bp"] as const;

export type VitalVsBandKey = (typeof VITAL_VS_BAND_KEYS)[number];

export type TriState = "present" | "absent" | "unknown";

export interface CaseInput {
  age: Age;
  vitals?: Partial<Record<VitalKey, number>>;
  discriminators?: Record<string, TriState>;
}

export type CompareOp = "lt" | "lte" | "gt" | "gte" | "eq";

export interface AgeBand {
  name: string;
  label_sk: string;
  /** Inclusive upper bound of this band in days. Bands are checked in ascending order. */
  max_age_days: number;
  vitals_normal?: Partial<Record<VitalKey, [number, number]>>;

}

/** A single condition. A rule fires only when ALL of its conditions hold (logical AND). */
export type Condition =
  | { kind: "vital"; vital: VitalKey; op: CompareOp; value: number }
  | {
      kind: "vital_vs_band";
      vital: "hr" | "rr" | "systolic_bp" | "diastolic_bp";
      bound: "above_normal" | "below_normal";
      factor?: number;
    }
  | { kind: "discriminator"; discriminator: string; state: TriState }
  | { kind: "age"; op: CompareOp; value: number; unit: AgeUnit };

export interface Rule {
  name: string;
  label_sk: string;
  color: Color;
  all: Condition[];
}

export interface RuleSet {
  version: string;
  default_color: Color;
  age_bands: AgeBand[];
  rules: Rule[];
}

export interface FiredRule {
  name: string;
  label_sk: string;
  color: Color;
}

export interface EvaluationResult {
  color: Color;
  band: string;
  band_label_sk: string;
  /** All rules that fired, in file order. */
  fired: FiredRule[];
  /** The decisive (highest-color, first-in-file) rule, or null when nothing fired (default color). */
  decisive: FiredRule | null;
  rule_set_version: string;
}
