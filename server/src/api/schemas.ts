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

export const VerdictSchema = z.object({
  agrees: z.boolean(),
  comment: z.string().optional(),
});

export const SaveSchema = z.object({
  draftId: z.string().min(1),
  verdict: VerdictSchema,
});

// Editing a saved case: the doctor may only revise their free-text comment. The agree/disagree
// itself stays immutable (it is the primary datapoint, recorded at the moment of review).
export const CommentPatchSchema = z.object({
  comment: z.string().optional(),
});

export type EnteredCaseInput = z.infer<typeof EnteredCaseSchema>;
export type VerdictInput = z.infer<typeof VerdictSchema>;
export type SaveInput = z.infer<typeof SaveSchema>;
export type CommentPatchInput = z.infer<typeof CommentPatchSchema>;
