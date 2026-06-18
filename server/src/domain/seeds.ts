// Seed cases: a curated library of mock presentations used to exercise the engine + extractor and
// to give doctors realistic cases to walk through. Authored as YAML (server/seeds/seeds.yaml), each
// entry is an EnteredCase shape plus optional coverage metadata (intent label, expected_color /
// expected_rule). The decision is NEVER taken from the seed — the case still runs through the live
// pipeline when loaded. Loading is best-effort: a missing/empty file yields no seeds.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import {
  COLORS,
  COMPLAINT_CATEGORIES,
  DISCRIMINATOR_KEYS,
  type Color,
} from "../engine/index.js";
import { AgeSchema, TriStateSchema, VitalsSchema } from "../api/schemas.js";

/** Path to the shipped seed library. */
export const DEFAULT_SEEDS_PATH = fileURLToPath(new URL("../../seeds/seeds.yaml", import.meta.url));

const categoryKeys = COMPLAINT_CATEGORIES.map((c) => c.key) as [string, ...string[]];

const SeedCaseSchema = z.object({
  // Author-supplied identifiers are optional; loadSeeds() fills sensible defaults so the picker
  // always has a stable id and a human label.
  id: z.string().min(1).optional(),
  intent: z.string().min(1).optional(),
  age: AgeSchema,
  complaint_category: z.enum(categoryKeys),
  complaint_text: z.string().optional(),
  note: z.string().min(1),
  vitals: VitalsSchema.default({}),
  // Tri-state findings keyed by KNOWN discriminator keys — a typo'd key would silently never fire,
  // so seeds (curated data) reject unknown keys rather than ignore them.
  discriminators: z
    .record(z.string(), TriStateSchema)
    .default({})
    .superRefine((obj, ctx) => {
      for (const key of Object.keys(obj)) {
        if (!DISCRIMINATOR_KEYS.includes(key)) {
          ctx.addIssue({ code: "custom", message: `unknown discriminator "${key}"` });
        }
      }
    }),
  // Coverage tags (NOT a doctor verdict): the author's expectation of what the engine should decide.
  expected_color: z.enum(COLORS as readonly [Color, ...Color[]]).optional(),
  expected_rule: z.string().optional(),
});

const SeedsFileSchema = z.array(SeedCaseSchema);

type ParsedSeed = z.infer<typeof SeedCaseSchema>;

/** A seed case as served to the client — id and intent are always present after normalization. */
export interface SeedCase extends Omit<ParsedSeed, "id" | "intent"> {
  id: string;
  intent: string;
}

const SLUG_RE = /[^a-z0-9]+/g;

function slugify(seed: ParsedSeed, index: number): string {
  const base = `${seed.complaint_category}-${seed.age.value}${seed.age.unit[0]}`;
  const slug = base.toLowerCase().replace(SLUG_RE, "-").replace(/^-|-$/g, "");
  return slug ? `${slug}-${index + 1}` : `seed-${index + 1}`;
}

function defaultLabel(seed: ParsedSeed): string {
  const category = COMPLAINT_CATEGORIES.find((c) => c.key === seed.complaint_category);
  return `${category?.label_sk ?? seed.complaint_category} · ${seed.age.value} ${seed.age.unit}`;
}

/** Parse + validate seed YAML. Throws with a readable message if the file is malformed. */
export function parseSeeds(yamlText: string): SeedCase[] {
  const raw = parse(yamlText) ?? [];
  const result = SeedsFileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid seeds file: ${JSON.stringify(result.error.flatten())}`);
  }
  return result.data.map((seed, i) => ({
    ...seed,
    id: seed.id ?? slugify(seed, i),
    intent: seed.intent ?? defaultLabel(seed),
  }));
}

/** Load the seed library from disk. A missing file is not an error — it yields an empty list. */
export function loadSeeds(path: string = DEFAULT_SEEDS_PATH): SeedCase[] {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  return parseSeeds(text);
}
