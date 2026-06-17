import type { AgeUnit } from "./types";

// A "logarithmic" index scale: 0–90 = days (0–90), 91–123 = months (4–36), 124–138 = years (4–18).
// 90 days and 36 months are the 3-month / 3-year handover points.
export const AGE_SLIDER_MAX = 90 + (36 - 3) + (18 - 3); // 138

export function ageToIndex(value: number, unit: AgeUnit): number {
  if (unit === "days")   return Math.min(90, Math.max(0, value));
  if (unit === "months") return Math.min(123, Math.max(91, 90 + (value - 3)));
  return Math.min(AGE_SLIDER_MAX, Math.max(124, 123 + (value - 3)));
}

export function indexToAge(index: number): { value: number; unit: AgeUnit } {
  if (index <= 90)  return { value: index, unit: "days" };
  if (index <= 123) return { value: 3 + (index - 90), unit: "months" };
  return { value: 3 + (index - 123), unit: "years" };
}

export function indexToDays(index: number): number {
  const { value, unit } = indexToAge(index);
  if (unit === "days")   return value;
  if (unit === "months") return value * 30;
  return value * 365;
}
