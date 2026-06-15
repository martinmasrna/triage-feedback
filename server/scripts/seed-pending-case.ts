import { evaluate, loadRuleSet } from "../src/engine/index.js";
import { assembleCase, mergeFindings } from "../src/domain/derive.js";
import type { EnteredCase } from "../src/domain/caseTypes.js";
import { buildReader, loadServerEnv } from "../src/llm/buildReader.js";
import { SqliteCaseStore } from "../src/store/sqliteCaseStore.js";

// One-off: create ONE "pre-filled + pre-triaged" case — as if an AI intake pipeline had filled
// in the case form and the real evaluation pipeline had already run, leaving a decision ready
// for a doctor to review (source: "ai_generated", verdict: null = pending). Run with
// `npm run seed:pending` (needs LLAMA_URL in server/.env for a real extraction + second opinion;
// falls back to StubReader otherwise).

loadServerEnv();

const ruleSet = loadRuleSet(process.env.RULES_PATH);
const store = new SqliteCaseStore(process.env.DB_PATH ?? "cases.db");
const reader = buildReader();

// Structured fields as the pre-fill pipeline would set them. The triage note is left for the
// real extractor to read: a temperature mentioned in prose (not typed into vitals), plus
// lethargy / reduced fluid intake that map to discriminators.
const entered: EnteredCase = {
  age: { value: 18, unit: "months" },
  complaint_category: "fever",
  note:
    "18-mesačné dievčatko, horúčka do 39,4°C od včera večera. Matka hovorí, že je nezvyčajne malátne " +
    "a spí viac ako obvykle, tekutiny prijíma len málo. Bez vyrážky, bez kŕčov, dýcha bez väčšej námahy.",
  vitals: { hr: 118, rr: 28, spo2: 97 },
  discriminators: {},
};

const extraction = await reader.extract(entered);
const effective = mergeFindings(entered, extraction);
const decision = evaluate(
  { age: entered.age, vitals: effective.vitals, discriminators: effective.discriminators },
  ruleSet,
);
const secondOpinion = await reader.secondOpinion(entered);

const stored = assembleCase({
  entered,
  extraction,
  secondOpinion,
  verdict: null,
  source: "ai_generated",
  ruleSet,
});
store.save(stored);
store.close();

console.log(`[seed] saved pending case ${stored.id}`);
console.log(
  `[seed] extraction ok=${extraction.ok}, vitals=${JSON.stringify(extraction.vitals)}, discriminators=${JSON.stringify(extraction.discriminators)}`,
);
console.log(`[seed] decision: ${decision.color} (${decision.band}) decisive=${decision.decisive?.name ?? "none"}`);
console.log(`[seed] second opinion: ${secondOpinion?.color ?? "none"}`);
