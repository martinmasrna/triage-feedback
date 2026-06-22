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
    case "lt" : return a < b;
    case "lte": return a <= b;
    case "gt" : return a > b;
    case "gte": return a >= b;
    case "eq" : return a === b;
  }
}

/**
 * Does a single condition hold for this case?
 *
 * Unknown data never satisfies a numeric condition: if a vital is missing, any rule needing
 * that vital simply does not fire. The absence of a measurement cannot assert a finding.
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
      const range = band.vitals_normal?.[c.vital];
      if (!range) return false;
      const [lower, upper] = range;
      if (c.bound === "above_normal") return v > upper * (c.factor ?? 1);
      return v < lower;
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

export function evaluate(input: CaseInput, ruleSet: RuleSet): EvaluationResult {
  const band = resolveBand(input.age, ruleSet.age_bands);

  const all_fired_rules: FiredRule[] = ruleSet.rules
    .filter((rule) => rule.all.every((c) => conditionHolds(c, input, band)))
    .map((rule) => ({ name: rule.name, label_sk: rule.label_sk, color: rule.color }));

  const maxPriority = all_fired_rules.length > 0
    ? Math.max(...all_fired_rules.map((f) => COLOR_PRIORITY[f.color]))
    : -1;

  const decisive_rule = all_fired_rules.find((f) => COLOR_PRIORITY[f.color] === maxPriority) ?? null;
  const color = decisive_rule?.color ?? ruleSet.default_color;

  return {
    color,
    band: band.name,
    band_label_sk: band.label_sk,
    all_fired_rules,
    decisive_rule,
    rule_set_version: ruleSet.version,
  };
}
