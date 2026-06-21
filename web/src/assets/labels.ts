import type { AgeUnit, CaseSource, Color, TriState } from "../interfaces/types";

// Colors ordered most → least urgent.
export const COLOR_ORDER: Color[] = ["RED", "ORANGE", "YELLOW", "GREEN", "BLUE"];

export const COLOR_LABEL: Record<Color, string> = {
  RED: "Červená",
  ORANGE: "Oranžová",
  YELLOW: "Žltá",
  GREEN: "Zelená",
  BLUE: "Modrá",
};

/** The doctor's agree/disagree verdict on the system's decision. */
export const VERDICT_LABEL = {
  agree: "Súhlas",
  disagree: "Nesúhlas",
} as const;

function pluralSk(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export function formatAge(value: number, unit: AgeUnit): string {
  if (unit === "days")   return `${value} ${pluralSk(value, "deň", "dni", "dní")}`;
  if (unit === "months") return `${value} ${pluralSk(value, "mesiac", "mesiace", "mesiacov")}`;
  return `${value} ${pluralSk(value, "rok", "roky", "rokov")}`;
}

export const TRISTATE_LABEL: Record<TriState, string> = {
  present: "Áno",
  absent: "Nie",
  unknown: "Neznáme",
};

/** Where a case's input data came from. */
export const SOURCE_LABEL: Record<CaseSource, string> = {
  doctor: "Zadané lekárom",
  ai_generated: "Predvyplnené AI",
};

/** Status shown for a pending case (no doctor verdict yet). */
export const PENDING_LABEL = "Čaká na posúdenie";

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("sk-SK")} · ${d.toLocaleTimeString("sk-SK")}`;
}
