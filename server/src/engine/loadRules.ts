import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  COLORS,
  type AgeBand,
  type Color,
  type CompareOp,
  type Condition,
  type Rule,
  type RuleSet,
  type TriState,
} from "./types.js";

/** Path to the shipped, clinician-editable rule set. */
export const DEFAULT_RULES_PATH = fileURLToPath(
  new URL("../../rules/triage-rules.yaml", import.meta.url),
);

const VALID_OPS: CompareOp[] = ["lt", "lte", "gt", "gte", "eq"];
const VALID_STATES: TriState[] = ["present", "absent", "unknown"];

export function loadRuleSet(path: string = DEFAULT_RULES_PATH): RuleSet {
  return parseRuleSet(readFileSync(path, "utf8"));
}

export function parseRuleSet(yamlText: string): RuleSet {
  const raw = parse(yamlText);
  return normalizeRuleSet(raw);
}

function fail(message: string): never {
  throw new Error(`Invalid rule set: ${message}`);
}

function assertColor(value: unknown, where: string): Color {
  if (typeof value !== "string" || !COLORS.includes(value as Color)) {
    fail(`${where} has invalid color ${JSON.stringify(value)} (expected one of ${COLORS.join(", ")})`);
  }
  return value as Color;
}

function normalizeRuleSet(raw: any): RuleSet {
  if (!raw || typeof raw !== "object") fail("file is empty or not an object");
  if (typeof raw.version !== "string") fail("missing string 'version'");
  const default_color = assertColor(raw.default_color, "default_color");

  if (!Array.isArray(raw.age_bands) || raw.age_bands.length === 0) {
    fail("'age_bands' must be a non-empty list");
  }
  const age_bands: AgeBand[] = raw.age_bands
    .map((b: any, i: number) => normalizeBand(b, i))
    .sort((a: AgeBand, b: AgeBand) => a.max_age_days - b.max_age_days);

  if (!Array.isArray(raw.rules)) fail("'rules' must be a list");
  const rules: Rule[] = raw.rules.map((r: any, i: number) => normalizeRule(r, i));

  return { version: raw.version, default_color, age_bands, rules };
}

function normalizeBand(raw: any, index: number): AgeBand {
  const where = `age_bands[${index}]`;
  if (typeof raw?.name !== "string") fail(`${where} missing string 'name'`);
  if (typeof raw.max_age_days !== "number") fail(`${where} (${raw.name}) missing number 'max_age_days'`);
  const band: AgeBand = {
    name: raw.name,
    label_sk: typeof raw.label_sk === "string" ? raw.label_sk : raw.name,
    max_age_days: raw.max_age_days,
  };
  if (raw.hr_normal !== undefined) band.hr_normal = asRange(raw.hr_normal, `${where}.hr_normal`);
  if (raw.rr_normal !== undefined) band.rr_normal = asRange(raw.rr_normal, `${where}.rr_normal`);
  if (raw.diastolic_bp_normal !== undefined) {
    band.diastolic_bp_normal = asRange(raw.diastolic_bp_normal, `${where}.diastolic_bp_normal`);
  }
  if (raw.min_systolic_bp !== undefined) {
    if (typeof raw.min_systolic_bp !== "number") fail(`${where}.min_systolic_bp must be a number`);
    band.min_systolic_bp = raw.min_systolic_bp;
  }
  return band;
}

function asRange(value: any, where: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number") {
    fail(`${where} must be [lower, upper] numbers`);
  }
  return [value[0], value[1]];
}

function normalizeRule(raw: any, index: number): Rule {
  const where = `rules[${index}]`;
  if (typeof raw?.name !== "string") fail(`${where} missing string 'name'`);
  const color = assertColor(raw.color, `${where} (${raw.name})`);
  if (!Array.isArray(raw.all) || raw.all.length === 0) {
    fail(`${where} (${raw.name}) must have a non-empty 'all' list of conditions`);
  }
  const all = raw.all.map((c: any, i: number) => parseCondition(c, `${where}.all[${i}] (${raw.name})`));
  return {
    name: raw.name,
    label_sk: typeof raw.label_sk === "string" ? raw.label_sk : raw.name,
    color,
    all,
  };
}

function assertOp(value: unknown, where: string): CompareOp {
  if (typeof value !== "string" || !VALID_OPS.includes(value as CompareOp)) {
    fail(`${where} has invalid op ${JSON.stringify(value)} (expected one of ${VALID_OPS.join(", ")})`);
  }
  return value as CompareOp;
}

function assertNumber(value: unknown, where: string): number {
  if (typeof value !== "number") fail(`${where} must be a number`);
  return value;
}

function parseCondition(raw: any, where: string): Condition {
  if (!raw || typeof raw !== "object") fail(`${where} is not a condition object`);

  if ("vital" in raw && "op" in raw) {
    return { kind: "vital", vital: raw.vital, op: assertOp(raw.op, where), value: assertNumber(raw.value, where) };
  }
  if ("vital_vs_band" in raw) {
    const vital = raw.vital_vs_band;
    if (vital !== "hr" && vital !== "rr" && vital !== "diastolic_bp") {
      fail(`${where}.vital_vs_band must be 'hr', 'rr', or 'diastolic_bp'`);
    }
    if (raw.bound !== "above_normal" && raw.bound !== "below_normal") {
      fail(`${where}.bound must be 'above_normal' or 'below_normal'`);
    }
    const cond: Extract<Condition, { kind: "vital_vs_band" }> = { kind: "vital_vs_band", vital, bound: raw.bound };
    if (raw.factor !== undefined) cond.factor = assertNumber(raw.factor, `${where}.factor`);
    return cond;
  }
  if ("bp_below_band_min" in raw) {
    return { kind: "bp_below_band_min" };
  }
  if ("discriminator" in raw) {
    if (typeof raw.discriminator !== "string") fail(`${where}.discriminator must be a string`);
    const state: TriState = raw.state ?? "present";
    if (!VALID_STATES.includes(state)) fail(`${where}.state has invalid value ${JSON.stringify(raw.state)}`);
    return { kind: "discriminator", discriminator: raw.discriminator, state };
  }
  if ("age" in raw) {
    const a = raw.age;
    if (!a || typeof a !== "object") fail(`${where}.age must be an object`);
    if (a.unit !== "days" && a.unit !== "months" && a.unit !== "years") {
      fail(`${where}.age.unit must be days|months|years`);
    }
    return { kind: "age", op: assertOp(a.op, `${where}.age`), value: assertNumber(a.value, `${where}.age`), unit: a.unit };
  }

  fail(`${where} has an unrecognized condition shape: ${JSON.stringify(raw)}`);
}
