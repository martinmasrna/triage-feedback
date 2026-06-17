import type { EvaluationResult } from "../engine/index.js";
import type { CaseSource, EnteredCase, StoredCase, Verdict } from "../domain/caseTypes.js";

// What a doctor is allowed to receive. The browser of a doctor must NEVER see the silent LLM
// second opinion, the extraction trace, or the "case as understood" (effective findings) — these
// are anchoring risks and analysis-only data (Part A / Step 4). Provenance is reduced to the
// rule-set version (model/prompt ids are admin-only). This is enforced at the API boundary
// by projecting through `toDoctorCase`, so the sensitive fields are never serialized to a doctor.
export interface DoctorCase {
  id: number;
  created_at: string;
  source: CaseSource;
  entered: EnteredCase;
  decision: EvaluationResult;
  /** null = awaiting doctor review (pending). */
  verdict: Verdict | null;
  provenance: {
    rule_set_version: string;
    created_at: string;
  };
}

/** Strip a StoredCase down to what the doctor may see. */
export function toDoctorCase(c: StoredCase): DoctorCase {
  return {
    id: c.id,
    created_at: c.created_at,
    source: c.source,
    entered: c.entered,
    decision: c.decision,
    verdict: c.verdict,
    provenance: {
      rule_set_version: c.provenance.rule_set_version,
      created_at: c.provenance.created_at,
    },
  };
}
