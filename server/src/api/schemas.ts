import { z } from "zod";
import { VITALS } from "../engine/vocabulary.js";

// Zod schemas validate everything the browser sends before it reaches our logic. The browser is
// untrusted input; these are the gate.

const triState = z.enum(["present", "absent", "unknown"]);

// A partial map of known vitals → numbers. Built as an object of optional keys (NOT an
// enum-keyed z.record, which zod v4 treats as exhaustive). Unknown keys are stripped.
// Vitals with declared min/max bounds (e.g. pain_score) are clamped accordingly.
const vitalsShape = Object.fromEntries(
  VITALS.map((v) => {
    let schema = z.number().finite();
    if (v.min !== undefined) schema = schema.min(v.min);
    if (v.max !== undefined) schema = schema.max(v.max);
    return [v.key, schema.optional()];
  }),
) as Record<(typeof VITALS)[number]["key"], z.ZodOptional<z.ZodNumber>>;
const VitalsSchema = z.object(vitalsShape);

export const AgeSchema = z.object({
  value: z.number().positive(),
  unit: z.enum(["days", "months", "years"]),
});

export const EnteredCaseSchema = z.object({
  age: AgeSchema,
  complaint_category: z.string().min(1),
  complaint_text: z.string().optional(),
  note: z.string().optional(),
  vitals: VitalsSchema.default({}),
  // Discriminators: any key → tri-state; the engine ignores keys it doesn't know.
  discriminators: z.record(z.string(), triState).default({}),
});

// The findings the reader produced from the note, as round-tripped by the browser. The note is
// read once (at step 1 → 2) to pre-fill the form; the same extraction is sent back at /evaluate so
// the original AI read is stored verbatim, distinct from whatever the doctor ended up entering.
export const ExtractionResultSchema = z.object({
  vitals: VitalsSchema.default({}),
  discriminators: z.record(z.string(), triState).default({}),
  ok: z.boolean(),
  model_id: z.string(),
  prompt_version: z.string(),
});

// /evaluate accepts the entered case plus, optionally, the pre-computed extraction from the
// pre-fill step. When present the server skips re-reading the note (it is deterministic) and the
// decision is taken on the entered form alone — the doctor's review is authoritative.
export const EvaluateRequestSchema = EnteredCaseSchema.extend({
  extraction: ExtractionResultSchema.optional(),
});

export const VerdictSchema = z.object({
  agrees: z.boolean(),
  comment: z.string().optional(),
});

export const SaveSchema = z.object({
  draftId: z.string().min(1),
  verdict: VerdictSchema,
});

// Editing a saved case: the doctor may revise their agree/disagree verdict and/or its free-text
// comment. Both fields are optional so a caller can touch just one; a pending case (no verdict yet)
// still goes through POST .../verdict first.
export const VerdictPatchSchema = z.object({
  agrees: z.boolean().optional(),
  comment: z.string().optional(),
});

export type EnteredCaseInput = z.infer<typeof EnteredCaseSchema>;
export type EvaluateRequestInput = z.infer<typeof EvaluateRequestSchema>;
export type ExtractionResultInput = z.infer<typeof ExtractionResultSchema>;
export type VerdictInput = z.infer<typeof VerdictSchema>;
export type SaveInput = z.infer<typeof SaveSchema>;
export type VerdictPatchInput = z.infer<typeof VerdictPatchSchema>;
