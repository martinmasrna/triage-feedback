import { ageInUnit, resolveBand } from "./age.js";
import {
  COLOR_PRIORITY,
  type AgeBand,
  type CaseInput,
  type CompareOp,
  type Condition,
  type EvaluationResult,
  type FiredRule,
  type RuleSet,
} from "./types.js";

function compare(a: number, op: CompareOp, b: number): boolean {
  switch (op) {
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "eq":
      return a === b;
  }
}

/**
 * Does a single condition hold for this case?
 *
 * Unknown data never satisfies a numeric condition: if a vital is missing, any rule needing
 * that vital simply does not fire. This is the "return unknown, never guess" principle applied
 * to the engine — the absence of a measurement cannot assert a finding.
 */
function conditionHolds(c: Condition, input: CaseInput, band: AgeBand): boolean {
  const vitals = input.vitals ?? {};
  const discriminators = input.discriminators ?? {};

  switch (c.kind) {
    case "vital": {
      const v = vitals[c.vital];
      if (v === undefined || v === null) return false;
      return compare(v, c.op, c.value);
    }
    case "vital_vs_band": {
      const v = vitals[c.vital];
      if (v === undefined || v === null) return false;
      const range =
        c.vital === "hr" ? band.hr_normal : c.vital === "rr" ? band.rr_normal : band.diastolic_bp_normal;
      if (!range) return false;
      const [lower, upper] = range;
      if (c.bound === "above_normal") return v > upper * (c.factor ?? 1);
      return v < lower; // below_normal
    }
    case "bp_below_band_min": {
      const v = vitals.systolic_bp;
      if (v === undefined || v === null) return false;
      const min = band.min_systolic_bp ?? 70 + 2 * Math.floor(ageInUnit(input.age, "years"));
      return v < min;
    }
    case "discriminator": {
      const state = discriminators[c.discriminator] ?? "unknown";
      return state === c.state;
    }
    case "age": {
      return compare(ageInUnit(input.age, c.unit), c.op, c.value);
    }
  }
}

/**
 * Evaluate a case against the rule set.
 *
 * A rule fires when ALL its conditions hold. The result color is the highest color among fired
 * rules (most-urgent-finding-wins; findings never sum). The decisive rule is the first fired
 * rule (file order) at that highest color, so YAML ordering encodes tie-break priority.
 * If nothing fires, the default color applies and there is no decisive rule.
 */
export function evaluate(input: CaseInput, ruleSet: RuleSet): EvaluationResult {
  const band = resolveBand(input.age, ruleSet.age_bands);

  const fired: FiredRule[] = ruleSet.rules
    .filter((rule) => rule.all.every((c) => conditionHolds(c, input, band)))
    .map((rule) => ({ name: rule.name, label_sk: rule.label_sk, color: rule.color }));

  let color = ruleSet.default_color;
  let decisive: FiredRule | null = null;

  if (fired.length > 0) {
    const maxPriority = Math.max(...fired.map((f) => COLOR_PRIORITY[f.color]));
    // find() returns the first match in file order → deterministic tie-break.
    decisive = fired.find((f) => COLOR_PRIORITY[f.color] === maxPriority) ?? null;
    if (decisive) color = decisive.color;
  }

  return {
    color,
    band: band.name,
    band_label_sk: band.label_sk,
    fired,
    decisive,
    rule_set_version: ruleSet.version,
  };
}
