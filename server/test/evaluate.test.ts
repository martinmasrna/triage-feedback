import { describe, expect, it } from "vitest";
import { evaluate } from "../src/engine/evaluate.js";
import { loadRuleSet } from "../src/engine/loadRules.js";
import { ageToDays, resolveBand } from "../src/engine/age.js";
import type { CaseInput } from "../src/engine/types.js";

const rules = loadRuleSet(); // loads the shipped provisional YAML

function run(input: CaseInput) {
  return evaluate(input, rules);
}

describe("age banding", () => {
  it("maps ages to days across units", () => {
    expect(ageToDays({ value: 10, unit: "days" })).toBe(10);
    expect(ageToDays({ value: 0, unit: "days" })).toBe(0);
    expect(Math.round(ageToDays({ value: 6, unit: "months" }))).toBe(183);
    expect(Math.round(ageToDays({ value: 2, unit: "years" }))).toBe(731);
  });

  it("resolves the correct band at and around boundaries", () => {
    const band = (input: { value: number; unit: "days" | "months" | "years" }) =>
      resolveBand(input, rules.age_bands).name;

    expect(band({ value: 0, unit: "days" })).toBe("neonate");
    expect(band({ value: 28, unit: "days" })).toBe("neonate");
    expect(band({ value: 29, unit: "days" })).toBe("infant");
    expect(band({ value: 6, unit: "months" })).toBe("infant");
    expect(band({ value: 1, unit: "years" })).toBe("toddler");
    expect(band({ value: 3, unit: "years" })).toBe("preschool");
    expect(band({ value: 8, unit: "years" })).toBe("school_age");
    expect(band({ value: 15, unit: "years" })).toBe("adolescent");
  });
});

describe("default / no rules fired", () => {
  it("returns GREEN with no decisive rule for a well infant with normal vitals", () => {
    const r = run({
      age: { value: 6, unit: "months" },
      vitals: { hr: 130, rr: 35, spo2: 98, temp: 37.0 },
    });
    expect(r.color).toBe("GREEN");
    expect(r.fired).toHaveLength(0);
    expect(r.decisive).toBeNull();
    expect(r.band).toBe("infant");
    expect(r.rule_set_version).toBe("0.1.0-draft");
  });
});

describe("red-flag floor", () => {
  it("severe hypoxia is RED and decisive", () => {
    const r = run({ age: { value: 4, unit: "years" }, vitals: { spo2: 85 } });
    expect(r.color).toBe("RED");
    expect(r.decisive?.name).toBe("severe_hypoxia");
  });

  it("an unknown SpO2 does NOT fire the hypoxia rule", () => {
    const r = run({ age: { value: 4, unit: "years" }, vitals: { hr: 100 } });
    expect(r.fired.map((f) => f.name)).not.toContain("severe_hypoxia");
  });

  it("unresponsive discriminator forces RED regardless of normal vitals", () => {
    const r = run({
      age: { value: 10, unit: "years" },
      vitals: { hr: 90, rr: 22, spo2: 99, temp: 37 },
      discriminators: { avpu_unresponsive: "present" },
    });
    expect(r.color).toBe("RED");
    expect(r.decisive?.name).toBe("unresponsive");
  });

  it("an 'absent' discriminator does not fire", () => {
    const r = run({
      age: { value: 10, unit: "years" },
      discriminators: { avpu_unresponsive: "absent" },
    });
    expect(r.fired.map((f) => f.name)).not.toContain("unresponsive");
  });

  it("tie-break: among two RED rules the first in file order is decisive", () => {
    const r = run({
      age: { value: 4, unit: "years" },
      vitals: { spo2: 85 },
      discriminators: { avpu_unresponsive: "present" },
    });
    expect(r.color).toBe("RED");
    // unresponsive is listed before severe_hypoxia in the YAML
    expect(r.decisive?.name).toBe("unresponsive");
    expect(r.fired.map((f) => f.name)).toEqual(expect.arrayContaining(["unresponsive", "severe_hypoxia"]));
  });

  it("shock = prolonged cap refill + tachycardia for age is RED", () => {
    const r = run({
      age: { value: 3, unit: "years" }, // preschool hr normal [95,140]
      vitals: { crt: 4, hr: 160 },
    });
    expect(r.color).toBe("RED");
    expect(r.decisive?.name).toBe("shock");
    // prolonged_cap_refill (ORANGE) and tachycardia_for_age (YELLOW) also fire, but RED wins
    expect(r.fired.map((f) => f.name)).toEqual(expect.arrayContaining(["shock", "prolonged_cap_refill", "tachycardia_for_age"]));
  });

  it("hypotension below the band minimum is RED", () => {
    // 3-year-old: min systolic = 70 + 2*3 = 76
    const low = run({ age: { value: 3, unit: "years" }, vitals: { systolic_bp: 70 } });
    expect(low.color).toBe("RED");
    expect(low.decisive?.name).toBe("hypotension_for_age");

    const ok = run({ age: { value: 3, unit: "years" }, vitals: { systolic_bp: 95 } });
    expect(ok.fired.map((f) => f.name)).not.toContain("hypotension_for_age");
  });
});

describe("age-banded vitals", () => {
  it("HR just over the band upper is YELLOW (tachycardia)", () => {
    // adolescent hr normal [60,100]; 110 > 100 but 110 <= 100*1.3 (130)
    const r = run({ age: { value: 15, unit: "years" }, vitals: { hr: 110 } });
    expect(r.color).toBe("YELLOW");
    expect(r.decisive?.name).toBe("tachycardia_for_age");
  });

  it("HR far over the band upper escalates to ORANGE (severe tachycardia), max-color wins", () => {
    // adolescent: 140 > 130 → severe; both tachy rules fire, ORANGE wins
    const r = run({ age: { value: 15, unit: "years" }, vitals: { hr: 140 } });
    expect(r.color).toBe("ORANGE");
    expect(r.decisive?.name).toBe("severe_tachycardia_for_age");
    expect(r.fired.map((f) => f.name)).toEqual(expect.arrayContaining(["severe_tachycardia_for_age", "tachycardia_for_age"]));
  });

  it("the same HR is normal for a younger band (no rule fires)", () => {
    // 110 bpm is normal for an infant (normal [110,160]); not > upper
    const r = run({ age: { value: 6, unit: "months" }, vitals: { hr: 110 } });
    expect(r.fired.map((f) => f.name)).not.toContain("tachycardia_for_age");
  });

  it("bradycardia for age is ORANGE", () => {
    const r = run({ age: { value: 6, unit: "months" }, vitals: { hr: 90 } }); // infant lower 110
    expect(r.color).toBe("ORANGE");
    expect(r.decisive?.name).toBe("bradycardia_for_age");
  });

  it("diastolic BP below the band lower bound is YELLOW (diastolic hypotension)", () => {
    const r = run({ age: { value: 3, unit: "years" }, vitals: { diastolic_bp: 40 } }); // preschool [45,72]
    expect(r.color).toBe("YELLOW");
    expect(r.decisive?.name).toBe("diastolic_hypotension_for_age");
  });

  it("diastolic BP above the band upper bound is YELLOW (diastolic hypertension)", () => {
    const r = run({ age: { value: 3, unit: "years" }, vitals: { diastolic_bp: 80 } }); // preschool [45,72]
    expect(r.color).toBe("YELLOW");
    expect(r.decisive?.name).toBe("diastolic_hypertension_for_age");
  });

  it("diastolic BP within the band normal range fires neither rule", () => {
    const r = run({ age: { value: 3, unit: "years" }, vitals: { diastolic_bp: 60 } }); // preschool [45,72]
    expect(r.fired.map((f) => f.name)).not.toEqual(
      expect.arrayContaining(["diastolic_hypotension_for_age", "diastolic_hypertension_for_age"]),
    );
  });
});

describe("age-conditioned rules", () => {
  it("fever in a young infant is ORANGE (outranks plain fever)", () => {
    const r = run({ age: { value: 2, unit: "months" }, vitals: { temp: 38.5 } });
    expect(r.color).toBe("ORANGE");
    expect(r.decisive?.name).toBe("fever_young_infant");
    expect(r.fired.map((f) => f.name)).toEqual(expect.arrayContaining(["fever_young_infant", "fever"]));
  });

  it("the same fever in an older child is just YELLOW (fever)", () => {
    const r = run({ age: { value: 5, unit: "years" }, vitals: { temp: 38.5 } });
    expect(r.color).toBe("YELLOW");
    expect(r.decisive?.name).toBe("fever");
    expect(r.fired.map((f) => f.name)).not.toContain("fever_young_infant");
  });
});
