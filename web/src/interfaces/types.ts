// Lightweight mirror of the server's API shapes. Kept here so the front end stays decoupled
// from the server package.

export type Color = "RED" | "ORANGE" | "YELLOW" | "GREEN" | "BLUE";
export type TriState = "present" | "absent" | "unknown";
export type AgeUnit = "days" | "months" | "years";

/** Whether a case's input data was typed by a doctor or pre-filled by the AI pipeline. */
export type CaseSource = "doctor" | "ai_generated";

export interface CategoryDef {
  key: string;
  label_sk: string;
}
export interface DiscriminatorDef {
  key: string;
  label_sk: string;
}
export interface VitalDef {
  key: string;
  label_sk: string;
  unit: string;
}

export interface FormOptions {
  complaint_categories: CategoryDef[];
  discriminators: DiscriminatorDef[];
  vitals: VitalDef[];
  colors: Color[];
}

export interface EnteredCase {
  age: { value: number; unit: AgeUnit };
  complaint_category: string;
  complaint_text?: string;
  note?: string;
  vitals: Record<string, number>;
  discriminators: Record<string, TriState>;
}

export interface FiredRule {
  name: string;
  label_sk: string;
  color: Color;
}

export interface Decision {
  color: Color;
  band: string;
  band_label_sk: string;
  fired: FiredRule[];
  decisive: FiredRule | null;
  rule_set_version: string;
}

export interface EvaluateResponse {
  draftId: string;
  decision: Decision;
  extraction_ok: boolean;
}

export interface Verdict {
  agrees: boolean;
  comment?: string;
  suggested_color?: Color;
}

export interface Findings {
  vitals: Record<string, number>;
  discriminators: Record<string, TriState>;
}

/** What the reader read from the note. Returned by /api/extract; round-tripped back to /api/evaluate. */
export interface ExtractionResult extends Findings {
  ok: boolean;
  model_id: string;
  prompt_version: string;
}

export interface StoredCase {
  id: number;
  created_at: string;
  source: CaseSource;
  entered: EnteredCase;
  extraction:
    | (Findings & { model_id: string; prompt_version: string; ok: boolean })
    | null;
  effective: Findings;
  decision: Decision;
  second_opinion: { color: Color; model_id: string; prompt_version: string } | null;
  verdict: Verdict | null;   /* null = awaiting doctor review (pending). */
  provenance: {
    rule_set_version: string;
    extractor_model_id: string | null;
    extractor_prompt_version: string | null;
    second_opinion_model_id: string | null;
    second_opinion_prompt_version: string | null;
    created_at: string;
  };
}

/**
 * The doctor-facing projection of a case (what `/api/cases*` returns). Deliberately omits the
 * silent second opinion, the extraction trace, the effective findings, and model provenance — the
 * server strips them at the boundary. The full `StoredCase` is only available via the admin API.
 */
export interface DoctorCase {
  id: number;
  created_at: string;
  source: CaseSource;
  entered: EnteredCase;
  decision: Decision;
  verdict: Verdict | null;   /* null = awaiting doctor review (pending). */
  provenance: {
    rule_set_version: string;
    created_at: string;
  };
}

export interface ListFilter {
  disagreementsOnly?: boolean;
}
