import type { StoredCase } from "../domain/caseTypes.js";

/** Canonical, lossless export — the source of truth for offline analysis. */
export function toJSON(cases: StoredCase[]): string {
  return JSON.stringify(cases, null, 2);
}

// Flat CSV for spreadsheets/stats. Nested structure (the fired-rules list) is squashed into a
// single ";"-joined column; the lossless detail lives in the JSON export.
const CSV_COLUMNS = [
  "id",
  "created_at",
  "source",
  "age_value",
  "age_unit",
  "band",
  "complaint_category",
  "complaint_text",
  "note",
  "system_color",
  "second_opinion_color",
  "doctor_agrees",
  "verdict_changed",
  "decisive_rule",
  "fired_rules",
  "doctor_comment",
  "extraction_ok",
  "rule_set_version",
  "extractor_model_id",
] as const;

function row(c: StoredCase): Record<(typeof CSV_COLUMNS)[number], string | number | undefined> {
  return {
    id: c.id,
    created_at: c.created_at,
    source: c.source,
    age_value: c.entered.age.value,
    age_unit: c.entered.age.unit,
    band: c.decision.band,
    complaint_category: c.entered.complaint_category,
    complaint_text: c.entered.complaint_text,
    note: c.entered.note,
    system_color: c.decision.color,
    second_opinion_color: c.second_opinion?.color,
    doctor_agrees: c.verdict ? String(c.verdict.agrees) : undefined,
    verdict_changed: String(c.verdict_changed),
    decisive_rule: c.decision.decisive?.name,
    fired_rules: c.decision.fired.map((f) => f.name).join(";"),
    doctor_comment: c.verdict?.comment,
    extraction_ok: c.extraction ? String(c.extraction.ok) : undefined,
    rule_set_version: c.provenance.rule_set_version,
    extractor_model_id: c.provenance.extractor_model_id ?? undefined,
  };
}

/** Escape a single CSV cell per RFC 4180: quote if it contains a comma, quote, CR or LF. */
function cell(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(cases: StoredCase[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = cases.map((c) => {
    const r = row(c);
    return CSV_COLUMNS.map((col) => cell(r[col])).join(",");
  });
  return [header, ...lines].join("\r\n");
}
