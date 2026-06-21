import type { DiscriminatorDef } from "../interfaces/types";

// Purely presentational grouping/shaping of the findings step, so it reads as labeled clinical
// sections with manageable controls instead of one long flat list of tri-state toggles. Kept
// web-side because it is display-only — the engine vocabulary (server) stays the single source
// of truth for keys; pairs of severe/moderate findings are still stored as two independent
// tri-state discriminators under the hood (see SeverityToggle).

export type SeverityValue = "severe" | "moderate" | "none" | "unknown";

export interface SeverityOption {
  value: SeverityValue;
  label_sk: string;
}

export interface SeverityRow {
  kind: "severity";
  label_sk: string;
  severeKey: string;
  moderateKey: string;
  options: SeverityOption[];
}

export interface ToggleRow {
  kind: "toggle";
  def: DiscriminatorDef;
}

export type FindingRow = ToggleRow | SeverityRow;

export interface DiscriminatorGroup {
  title_sk: string;
  rows: FindingRow[];
}

type RowSpec =
  | { key: string }
  | {
      severityPair: {
        label_sk: string;
        severeKey: string;
        moderateKey: string;
        severeLabel_sk: string;
        moderateLabel_sk: string;
        /** Override for the "none" option label (default "Žiadna"). */
        noneLabel_sk?: string;
      };
    };

interface GroupSpec {
  title_sk: string;
  rows: RowSpec[];
}

const GROUPS: GroupSpec[] = [
  {
    title_sk: "Celkový dojem (PAT)",
    rows: [
      { key: "pat_appearance_abnormal" },
      { key: "pat_wob_abnormal" },
      { key: "pat_circulation_abnormal" },
    ],
  },
  {
    title_sk: "Vedomie a neurológia",
    rows: [
      {
        severityPair: {
          label_sk: "Vedomie (AVPU)",
          severeKey: "avpu_unresponsive",
          moderateKey: "altered_consciousness",
          severeLabel_sk: "Bezvedomie",
          moderateLabel_sk: "Porucha vedomia",
          noneLabel_sk: "Pri vedomí",
        },
      },
      { key: "active_seizure" },
    ],
  },
  {
    title_sk: "Dýchacie cesty a dýchanie",
    rows: [
      { key: "airway_compromise" },
      { key: "apnoea" },
      {
        severityPair: {
          label_sk: "Dychová tieseň",
          severeKey: "severe_resp_distress",
          moderateKey: "moderate_resp_distress",
          severeLabel_sk: "Závažná",
          moderateLabel_sk: "Stredná",
        },
      },
      { key: "central_cyanosis" },
      { key: "on_oxygen" },
    ],
  },
  {
    title_sk: "Ďalšie nálezy",
    rows: [
      {
        severityPair: {
          label_sk: "Dehydratácia",
          severeKey: "significant_dehydration",
          moderateKey: "moderate_dehydration",
          severeLabel_sk: "Závažná",
          moderateLabel_sk: "Stredná",
        },
      },
      { key: "non_blanching_rash" },
      { key: "immunocompromised" },
      { key: "poor_feeding" },
      { key: "reduced_urine_output" },
    ],
  },
];

const DEFAULT_NONE_LABEL_SK = "Žiadna";
const UNKNOWN_OPTION: SeverityOption = { value: "unknown", label_sk: "Neznáme" };

/**
 * Build the findings step from /api/form-options: groups by clinical area, and folds known
 * severe/moderate discriminator pairs into a single 4-state severity row (severe / moderate /
 * none / unknown) so they can't both be answered "present" at once. Any other vocabulary key not
 * covered by a group falls into a trailing "Ostatné" group, so a new entry is never silently
 * dropped from the form.
 */
export function groupDiscriminators(defs: DiscriminatorDef[]): DiscriminatorGroup[] {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const used = new Set<string>();

  const groups: DiscriminatorGroup[] = GROUPS.map((g) => {
    const rows: FindingRow[] = [];
    for (const spec of g.rows) {
      if ("key" in spec) {
        const def = byKey.get(spec.key);
        if (!def) continue;
        used.add(def.key);
        rows.push({ kind: "toggle", def });
      } else {
        const { severeKey, moderateKey, label_sk, severeLabel_sk, moderateLabel_sk, noneLabel_sk } =
          spec.severityPair;
        if (!byKey.has(severeKey) || !byKey.has(moderateKey)) continue;
        used.add(severeKey);
        used.add(moderateKey);
        rows.push({
          kind: "severity",
          label_sk,
          severeKey,
          moderateKey,
          options: [
            { value: "severe", label_sk: severeLabel_sk },
            { value: "moderate", label_sk: moderateLabel_sk },
            { value: "none", label_sk: noneLabel_sk ?? DEFAULT_NONE_LABEL_SK },
            UNKNOWN_OPTION,
          ],
        });
      }
    }
    return { title_sk: g.title_sk, rows };
  }).filter((g) => g.rows.length > 0);

  const leftover = defs.filter((d) => !used.has(d.key));
  if (leftover.length) groups.push({ title_sk: "Ostatné", rows: leftover.map((def) => ({ kind: "toggle", def })) });

  return groups;
}
