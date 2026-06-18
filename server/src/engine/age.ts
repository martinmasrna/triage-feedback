import type { Age, AgeUnit, AgeBand } from "./types.js";

// Deliberately approximate — a fraction of a day at a boundary does not matter clinically.
const DAYS_PER_MONTH = 30.4375;
const DAYS_PER_YEAR = 365.25;

export function ageToDays(age: Age): number {
  switch (age.unit) {
    case "days"  : return age.value;
    case "months": return age.value * DAYS_PER_MONTH;
    case "years" : return age.value * DAYS_PER_YEAR;
  }
}

export function ageInUnit(age: Age, unit: AgeUnit): number {
  const days = ageToDays(age);
  switch (unit) {
    case "days"  : return days;
    case "months": return days / DAYS_PER_MONTH;
    case "years" : return days / DAYS_PER_YEAR;
  }
}

//Resolve which age band a case falls into. 
export function resolveBand(age: Age, bands: AgeBand[]): AgeBand {
  const last = bands[bands.length - 1];
  if (!last) throw new Error("Rule set has no age bands");

  const days = ageToDays(age);
  return bands.find((band) => days <= band.max_age_days) ?? last;
}
