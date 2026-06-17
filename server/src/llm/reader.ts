import type { Age, Color, TriState, VitalKey } from "../engine/types.js";
import { COLORS } from "../engine/types.js";
import {
  DISCRIMINATORS,
  VITALS,
  discriminatorListText,
  vitalListText,
} from "../engine/vocabulary.js";
import type { ExtractionResult, SecondOpinion } from "../domain/caseTypes.js";
import type { LlmClient } from "./client.js";
import { buildExtractionSchema, buildSecondOpinionSchema } from "./schema.js";
import { loadPrompt, renderPrompt, type LoadedPrompt } from "./prompt.js";

// The reader = the "extractor". It turns a case's prose into structured findings (extraction)
// and, separately, asks the model for its own silent triage color (second opinion). It is the
// ONLY AI piece; it never decides the shown color. It depends only on the LlmClient interface,
// so it is fully testable with a mock.

/** What the reader needs about a case. Mirrors the doctor's entries. */
export interface ReaderInput {
  age: Age;
  complaint_category: string;
  complaint_text?: string;
  note?: string;
  vitals: Partial<Record<VitalKey, number>>;
  discriminators: Record<string, TriState>;
}

export interface Reader {
  /** Read the note/complaint into structured findings. Never throws — on failure returns ok:false. */
  extract(input: ReaderInput): Promise<ExtractionResult>;
  /** The model's independent triage color, stored silently. Returns null on failure. */
  secondOpinion(input: ReaderInput): Promise<SecondOpinion | null>;
}

export interface ReaderPrompts {
  extraction: LoadedPrompt;
  secondOpinion: LoadedPrompt;
}

export interface LoadReaderPromptsOptions {
  /** Directory to load from (defaults to the shipped prompts/). */
  dir?: string;
  /** Extraction prompt file base name. Default "extraction"; use "extraction.sk" for the Slovak A/B variant. */
  extraction?: string;
  /** Second-opinion prompt file base name. Default "second-opinion"; use "second-opinion.sk" for Slovak. */
  secondOpinion?: string;
}

export function loadReaderPrompts(opts: LoadReaderPromptsOptions = {}): ReaderPrompts {
  return {
    extraction: loadPrompt(opts.extraction ?? "extraction", opts.dir),
    secondOpinion: loadPrompt(opts.secondOpinion ?? "second-opinion", opts.dir),
  };
}

export class LlmReader implements Reader {
  private readonly extractionSchema = buildExtractionSchema();
  private readonly secondOpinionSchema = buildSecondOpinionSchema();

  constructor(
    private readonly client: LlmClient,
    private readonly prompts: ReaderPrompts,
  ) {}

  async extract(input: ReaderInput): Promise<ExtractionResult> {
    const promptVersion = this.prompts.extraction.meta.version;
    try {
      const rendered = renderPrompt(this.prompts.extraction, {
        complaint_category: input.complaint_category,
        complaint_text: input.complaint_text,
        note: input.note,
        discriminator_list: discriminatorListText(),
        vital_list: vitalListText(),
      });
      const raw = await this.client.complete({
        system: rendered.system,
        user: rendered.user,
        schema: this.extractionSchema,
        temperature: this.prompts.extraction.meta.temperature,
      });
      return mapExtraction(JSON.parse(raw), this.client.modelId, promptVersion);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { vitals: {}, discriminators: {}, ok: false, model_id: this.client.modelId, prompt_version: promptVersion, error };
    }
  }

  async secondOpinion(input: ReaderInput): Promise<SecondOpinion | null> {
    const promptVersion = this.prompts.secondOpinion.meta.version;
    try {
      const rendered = renderPrompt(this.prompts.secondOpinion, {
        complaint_category: input.complaint_category,
        complaint_text: input.complaint_text,
        note: input.note,
        case_summary: caseSummary(input),
      });
      const raw = await this.client.complete({
        system: rendered.system,
        user: rendered.user,
        schema: this.secondOpinionSchema,
        temperature: this.prompts.secondOpinion.meta.temperature,
      });
      const parsed = JSON.parse(raw) as { color?: string };
      if (!parsed.color || !COLORS.includes(parsed.color as Color)) return null;
      return { color: parsed.color as Color, model_id: this.client.modelId, prompt_version: promptVersion };
    } catch {
      return null;
    }
  }
}

/** Dev/test reader for running the pipeline without a model: reads nothing, gives no opinion. */
export class StubReader implements Reader {
  constructor(private readonly promptVersion = "stub") {}
  async extract(_input: ReaderInput): Promise<ExtractionResult> {
    return { vitals: {}, discriminators: {}, ok: true, model_id: "stub", prompt_version: this.promptVersion };
  }
  async secondOpinion(_input: ReaderInput): Promise<SecondOpinion | null> {
    return null;
  }
}

/** Map the (schema-constrained) model JSON into our domain ExtractionResult, dropping nulls. */
function mapExtraction(parsed: unknown, modelId: string, promptVersion: string): ExtractionResult {
  const obj = (parsed ?? {}) as { vitals?: Record<string, unknown>; discriminators?: Record<string, unknown> };

  const vitals: Partial<Record<VitalKey, number>> = {};
  for (const v of VITALS) {
    const value = obj.vitals?.[v.key];
    if (typeof value === "number" && Number.isFinite(value)) vitals[v.key] = value;
  }

  const discriminators: Record<string, TriState> = {};
  for (const d of DISCRIMINATORS) {
    const state = obj.discriminators?.[d.key];
    if (state === "present" || state === "absent" || state === "unknown") discriminators[d.key] = state;
  }

  return { vitals, discriminators, ok: true, model_id: modelId, prompt_version: promptVersion };
}

/** A compact textual summary of the entered case, injected into the second-opinion prompt. */
function caseSummary(input: ReaderInput): string {
  const lines: string[] = [];
  const enteredVitals = VITALS.filter((v) => input.vitals[v.key] !== undefined).map(
    (v) => `- ${v.label_sk}: ${input.vitals[v.key]} ${v.unit}`,
  );
  const present = DISCRIMINATORS.filter((d) => input.discriminators[d.key] === "present").map((d) => `- ${d.label_sk}`);

  lines.push(`Vek: ${input.age.value} ${input.age.unit}`);
  lines.push(enteredVitals.length ? `Vitálne funkcie:\n${enteredVitals.join("\n")}` : "Vitálne funkcie: neuvedené");
  if (present.length) lines.push(`Prítomné nálezy:\n${present.join("\n")}`);
  return lines.join("\n");
}
