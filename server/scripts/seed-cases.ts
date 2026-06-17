/**
 * Bulk-seeds curated cases from seeds.yaml into the "na posudenie" (pending review) queue.
 *
 * Each seed is run through the live LLM extractor + deterministic engine and stored as an
 * ai_generated case with verdict: null (awaiting doctor review). Re-running is safe — cases whose
 * seed_id already appears in the DB are skipped. Cases where extraction fails are retried
 * automatically up to MAX_RETRIES times before being abandoned.
 *
 * Usage:
 *   npx tsx scripts/seed-cases.ts [--seeds-path ./path/to/seeds.yaml] [--db-path ./cases.db]
 *
 * Requires LLAMA_URL to be set (or present in server/.env).
 */

import { parseArgs } from "node:util";
import { loadServerEnv, buildReader } from "../src/llm/buildReader.js";
import { loadRuleSet } from "../src/engine/index.js";
import { SqliteCaseStore } from "../src/store/sqliteCaseStore.js";
import { loadSeeds } from "../src/domain/seeds.js";
import type { SeedCase } from "../src/domain/seeds.js";
import { assembleCase, mergeFindings } from "../src/domain/derive.js";
import type { EnteredCase } from "../src/domain/caseTypes.js";

process.env.LLAMA_TIMEOUT_MS ??= "60000";
loadServerEnv();

const MAX_RETRIES = 3;

const { values: args } = parseArgs({
  options: {
    "seeds-path": { type: "string" },
    "db-path": { type: "string" },
  },
  strict: false,
});

const seedsPath = args["seeds-path"] as string | undefined;
const dbPath = (args["db-path"] as string | undefined) ?? process.env.DB_PATH ?? "cases.db";

const seeds = loadSeeds(seedsPath);
if (seeds.length === 0) {
  console.log("No seeds found — nothing to do.");
  process.exit(0);
}

const store = new SqliteCaseStore(dbPath);
const ruleSet = loadRuleSet(process.env.RULES_PATH);
const reader = buildReader();

function storedSeedCaseIds(): Set<string> {
  return new Set(
    store.list().map((c) => c.seed_id).filter((id): id is string => !!id),
  );
}

interface PassResult {
  seeded: number;
  skipped: number;
  failed: SeedCase[];
}

async function runPass(pending: SeedCase[], passLabel: string): Promise<PassResult> {
  const existing = storedSeedCaseIds();
  const failed: SeedCase[] = [];
  let seeded = 0;
  let skipped = 0;
  const total = pending.length;

  for (let i = 0; i < pending.length; i++) {
    const seed = pending[i]!;
    const prefix = `${passLabel}[${i + 1}/${total}]`;

    if (existing.has(seed.id)) {
      console.log(`${prefix}  skip   ${seed.id}`);
      skipped++;
      continue;
    }

    const entered: EnteredCase = {
      age: seed.age,
      complaint_category: seed.complaint_category,
      complaint_text: seed.complaint_text,
      note: seed.note,
      vitals: seed.vitals,
      discriminators: seed.discriminators,
    };

    const extraction = await reader.extract(entered);

    if (!extraction.ok) {
      const reason = extraction.error ? `: ${extraction.error}` : "";
      console.log(`${prefix}  fail   ${seed.id}  (LLM extraction failed${reason})`);
      failed.push(seed);
      continue;
    }

    const effective = mergeFindings(entered, extraction);
    const secondOpinion = await reader.secondOpinion(entered);

    const stored = store.create({
      ...assembleCase({
        entered,
        extraction,
        effective,
        secondOpinion,
        verdict: null,
        ruleSet,
        source: "ai_generated",
      }),
      seed_id: seed.id,
    });

    const color = stored.decision.color.padEnd(6);
    console.log(`${prefix}  store  ${color} ${seed.id}`);
    seeded++;
  }

  return { seeded, skipped, failed };
}

// ── Pass 1: full batch ────────────────────────────────────────────────────────
let { seeded, skipped, failed } = await runPass(seeds, "");

// ── Retry passes ─────────────────────────────────────────────────────────────
for (let attempt = 1; attempt <= MAX_RETRIES && failed.length > 0; attempt++) {
  console.log(`\nRetry ${attempt}/${MAX_RETRIES} — ${failed.length} case${failed.length === 1 ? "" : "s"} failed, retrying…\n`);
  const result = await runPass(failed, `[r${attempt}]`);
  seeded += result.seeded;
  failed = result.failed;
}

// ── Summary ───────────────────────────────────────────────────────────────────
store.close();
console.log(`\nDone. Seeded: ${seeded}, skipped (already present): ${skipped}, failed after ${MAX_RETRIES} retries: ${failed.length}.`);
if (failed.length > 0) {
  for (const s of failed) console.log(`  abandoned  ${s.id}`);
}
