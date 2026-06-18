// The stored case record (Step 6). One saved case bundles: what was entered, what the system
// understood (the silent extraction trace, kept DISTINCT from doctor entries), what it decided
// and why, the silent LLM second opinion, the doctor's verdict, and full provenance for
// longitudinal comparison as rules/models evolve.

import type {
  Age,
  Color,
  EvaluationResult,
  TriState,
  VitalKey,
} from "../engine/index.js";

/** Findings as a pair of vitals + discriminators (used for entered, extracted, and effective). */
export interface Findings {
  vitals: Partial<Record<VitalKey, number>>;
  discriminators: Record<string, TriState>;
}

/** Exactly what the doctor typed. Omitted vitals = not entered; omitted/"unknown" discriminators = not set. */
export interface EnteredCase {
  age: Age;
  complaint_category: string;
  complaint_text?: string;
  note?: string;
  vitals: Partial<Record<VitalKey, number>>;
  discriminators: Record<string, TriState>;
}

/** What the LLM read from the note/complaint. Stored silently; never shown live. */
export interface ExtractionResult extends Findings {
  model_id: string;
  /** Version of the extraction prompt that produced this (provenance). */
  prompt_version: string;
  /** false when the LLM could not reliably read the note (the "continue on structured fields" case). */
  ok: boolean;
  /** Present only when ok:false — the reason the extraction failed. Never stored. */
  error?: string;
}

/** The LLM's independent triage color — stored silently, never shown as the decision. */
export interface SecondOpinion {
  color: Color;
  model_id: string;
  /** Version of the second-opinion prompt that produced this (provenance). */
  prompt_version: string;
}

/**
 * The doctor's verdict on the system's decision: a simple agree/disagree plus an optional
 * free-text explanation. Both fields can be revised when revisiting a saved case.
 */
export interface Verdict {
  agrees: boolean;
  comment?: string;
  suggested_color?: Color;
}

/** How a case's input data came to exist: typed by a doctor, or pre-filled by the AI pipeline. */
export type CaseSource = "doctor" | "ai_generated";

export interface Provenance {
  rule_set_version: string;
  extractor_model_id: string | null;
  extractor_prompt_version: string | null;
  second_opinion_model_id: string | null;
  second_opinion_prompt_version: string | null;
  created_at: string;
}

export interface StoredCase {
  id: number;
  created_at: string;

  /** Whether the inputs were typed by a doctor or pre-filled by the AI pipeline. */
  source: CaseSource;

  /** Stable slug from seeds.yaml — present only on cases inserted by the seed script. Used to skip already-seeded cases on re-run. */
  seed_id?: string;

  /** Inputs exactly as entered. */
  entered: EnteredCase;

  /** What the system understood (LLM), kept separate from entered. null if extraction was skipped. */
  extraction: ExtractionResult | null;

  /** The findings actually consumed by the engine (entered merged over extraction; doctor wins). */
  effective: Findings;

  /** What the system decided + the real explanation (fired rules + decisive). */
  decision: EvaluationResult;

  /** The silent LLM second opinion. */
  second_opinion: SecondOpinion | null;

  /** The doctor's verdict on the decision. null = awaiting doctor review (pending). */
  verdict: Verdict | null;

  /**
   * Silent (analysis-only, never shown to the doctor): true once a post-hoc revision changed the
   * agree/disagree from the value first recorded. Sticky — stays true even if later flipped back.
   * Comment-only edits do not set it.
   */
  verdict_changed: boolean;

  provenance: Provenance;
}

/** A case that hasn't been persisted yet — no id assigned. */
export type NewCase = Omit<StoredCase, "id">;
