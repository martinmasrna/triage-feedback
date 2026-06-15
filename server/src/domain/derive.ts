import { randomUUID } from "node:crypto";
import { evaluate, type RuleSet } from "../engine/index.js";
import type {
  CaseSource,
  EnteredCase,
  ExtractionResult,
  Findings,
  SecondOpinion,
  StoredCase,
  Verdict,
} from "./caseTypes.js";

/**
 * Merge what the doctor entered over what the LLM extracted — the doctor always wins.
 *
 *  - Vitals: a doctor-typed value overrides any prose-extracted value; vitals the doctor
 *    left blank fall back to the extraction.
 *  - Discriminators: a doctor's explicit "present"/"absent" wins; if the doctor left it
 *    "unknown" (or never touched it), the extraction's value is used.
 */
export function mergeFindings(entered: EnteredCase, extraction: ExtractionResult | null): Findings {
  const vitals = { ...(extraction?.vitals ?? {}), ...entered.vitals };

  const discriminators = { ...(extraction?.discriminators ?? {}) };
  for (const [key, state] of Object.entries(entered.discriminators)) {
    if (state === "present" || state === "absent") discriminators[key] = state;
  }

  return { vitals, discriminators };
}

export interface AssembleArgs {
  entered: EnteredCase;
  extraction?: ExtractionResult | null;
  secondOpinion?: SecondOpinion | null;
  /**
   * The findings the engine should decide on. When omitted, they are derived by merging the
   * extraction under the entered case (the gap-filling flow, doctor wins). Supply this explicitly
   * for the pre-fill flow, where the extraction was already folded into the form and the entered
   * case is the doctor's authoritative, reviewed state.
   */
  effective?: Findings;
  /** null = no doctor verdict yet (pending review). */
  verdict: Verdict | null;
  ruleSet: RuleSet;
  /** "doctor" (default) or "ai_generated" (pre-filled, pending review). */
  source?: CaseSource;
  /** Injectable for deterministic tests. */
  id?: string;
  now?: Date;
}

/**
 * Build a complete StoredCase from its parts: resolves the effective findings (explicit, or
 * extraction merged under the entered case), runs the engine on them, and stamps provenance. This
 * is the single place a case is composed, so `effective` and `decision` can never drift apart.
 */
export function assembleCase(args: AssembleArgs): StoredCase {
  const { entered, ruleSet, verdict } = args;
  const extraction = args.extraction ?? null;
  const secondOpinion = args.secondOpinion ?? null;
  const created_at = (args.now ?? new Date()).toISOString();
  const id = args.id ?? randomUUID();

  const effective = args.effective ?? mergeFindings(entered, extraction);
  const decision = evaluate(
    { age: entered.age, vitals: effective.vitals, discriminators: effective.discriminators },
    ruleSet,
  );

  return {
    id,
    created_at,
    source: args.source ?? "doctor",
    entered,
    extraction,
    effective,
    decision,
    second_opinion: secondOpinion,
    verdict,
    verdict_changed: false,
    provenance: {
      rule_set_version: decision.rule_set_version,
      extractor_model_id: extraction?.model_id ?? null,
      extractor_prompt_version: extraction?.prompt_version ?? null,
      second_opinion_model_id: secondOpinion?.model_id ?? null,
      second_opinion_prompt_version: secondOpinion?.prompt_version ?? null,
      created_at,
    },
  };
}
