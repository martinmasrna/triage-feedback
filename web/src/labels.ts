import type { AgeUnit, CaseSource, Color, TriState } from "./types";

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

export const AGE_UNIT_LABEL: Record<AgeUnit, string> = {
  days: "dní",
  months: "mes.",
  years: "r.",
};

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
