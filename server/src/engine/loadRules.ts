import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import {
  COLORS,
  VITAL_VS_BAND_KEYS,
  type AgeBand,
  type Color,
  type Condition,
  type Rule,
  type RuleSet,
  type VitalKey,
} from "./types.js";

/** Path to the shipped, clinician-editable rule set. */
export const DEFAULT_RULES_PATH = fileURLToPath(
  new URL("../../rules/triage-rules.yaml", import.meta.url),
);

// --- Primitive schemas -------------------------------------------------------

const ColorSchema = z.enum(COLORS as readonly [Color, ...Color[]]);
const CompareOpSchema = z.enum(["lt", "lte", "gt", "gte", "eq"]);
const TriStateSchema = z.enum(["present", "absent", "unknown"]);
const AgeUnitSchema = z.enum(["days", "months", "years"]);
const VitalVsBandKeySchema = z.enum(VITAL_VS_BAND_KEYS);

// --- Condition schema --------------------------------------------------------
// Conditions are authored in YAML with the kind implicit in the key used (e.g. `vital:`,
// `discriminator:`). Each branch transforms to the internal Condition shape (adding `kind`).

const ConditionSchema: z.ZodType<Condition> = z.union([
  z
    .object({ vital: z.string(), op: CompareOpSchema, value: z.number() })
    .transform((c): Condition => ({ kind: "vital", vital: c.vital as VitalKey, op: c.op, value: c.value })),
  z
    .object({ vital_vs_band: VitalVsBandKeySchema, bound: z.enum(["above_normal", "below_normal"]), factor: z.number().optional() })
    .transform((c): Condition => ({ kind: "vital_vs_band", vital: c.vital_vs_band, bound: c.bound, ...(c.factor !== undefined && { factor: c.factor }) })),
  z
    .object({ discriminator: z.string(), state: TriStateSchema.default("present") })
    .transform((c): Condition => ({ kind: "discriminator", discriminator: c.discriminator, state: c.state })),
  z
    .object({ age: z.object({ op: CompareOpSchema, value: z.number(), unit: AgeUnitSchema }) })
    .transform((c): Condition => ({ kind: "age", op: c.age.op, value: c.age.value, unit: c.age.unit })),
]) as z.ZodType<Condition>;

// --- Rule schema -------------------------------------------------------------

const RuleSchema = z
  .object({
    name: z.string(),
    label_sk: z.string().optional(),
    color: ColorSchema,
    all: z.array(ConditionSchema).min(1),
  })
  .transform((r): Rule => ({ ...r, label_sk: r.label_sk ?? r.name }));

// --- AgeBand schema ----------------------------------------------------------

const AgeBandSchema = z
  .object({
    name: z.string(),
    label_sk: z.string().optional(),
    max_age_days: z.number(),
    // z.string() key avoids Zod v4 treating an enum-keyed record as exhaustive.
    vitals_normal: z.record(z.string(), z.tuple([z.number(), z.number()])).optional(),
  })
  .transform((b): AgeBand => ({
    ...b,
    label_sk: b.label_sk ?? b.name,
    vitals_normal: b.vitals_normal as AgeBand["vitals_normal"],
  }));

// --- RuleSet schema ----------------------------------------------------------

const RuleSetSchema = z
  .object({
    version: z.string(),
    default_color: ColorSchema,
    age_bands: z.array(AgeBandSchema).min(1),
    rules: z.array(RuleSchema),
  })
  .transform((rs): RuleSet => ({
    ...rs,
    age_bands: [...rs.age_bands].sort((a, b) => a.max_age_days - b.max_age_days),
  }));

// --- Public API --------------------------------------------------------------

export function loadRuleSet(path: string = DEFAULT_RULES_PATH): RuleSet {
  return parseRuleSet(readFileSync(path, "utf8"));
}

export function parseRuleSet(yamlText: string): RuleSet {
  const raw = parse(yamlText);
  const result = RuleSetSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid rule set: ${JSON.stringify(result.error.flatten())}`);
  }
  return result.data;
}
