import { COLORS } from "../engine/types.js";
import { DISCRIMINATOR_KEYS, VITAL_KEYS } from "../engine/vocabulary.js";

// JSON Schemas that constrain the model's output so it cannot return malformed data. Generated
// from the canonical vocabulary (engine/vocabulary.ts) — the same source the prompts inject —
// so the schema and the prompt can never list different findings.

/** Schema for the extraction call: every vital nullable, every discriminator a tri-state. */
export function buildExtractionSchema(): object {
  const vitals: Record<string, object> = {};
  for (const key of VITAL_KEYS) {
    vitals[key] = { type: ["number", "null"] };
  }

  const discriminators: Record<string, object> = {};
  for (const key of DISCRIMINATOR_KEYS) {
    discriminators[key] = { type: "string", enum: ["present", "absent", "unknown"] };
  }

  return {
    type: "object",
    additionalProperties: false,
    required: ["vitals", "discriminators"],
    properties: {
      vitals: {
        type: "object",
        additionalProperties: false,
        required: [...VITAL_KEYS],
        properties: vitals,
      },
      discriminators: {
        type: "object",
        additionalProperties: false,
        required: [...DISCRIMINATOR_KEYS],
        properties: discriminators,
      },
    },
  };
}

/** Schema for the silent second-opinion call: one of the five colors, plus an optional rationale. */
export function buildSecondOpinionSchema(): object {
  return {
    type: "object",
    additionalProperties: false,
    required: ["color"],
    properties: {
      color: { type: "string", enum: [...COLORS] },
      rationale: { type: "string" },
    },
  };
}
