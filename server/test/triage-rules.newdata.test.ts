import { describe, expect, it } from "vitest";
import { evaluate } from "../src/engine/evaluate.js";
import { loadRuleSet } from "../src/engine/loadRules.js";
import type { CaseInput } from "../src/engine/types.js";

const rules = loadRuleSet(); // loads the shipped provisional YAML

function run(input: CaseInput) {
  return evaluate(input, rules);
}

describe("oxygen-aware SpO2 rules", () => {
  it("severe hypoxia on room air is RED (severe_hypoxia)", () => {
    const r = run({
      age: { value: 5, unit: "years" },
      vitals: { spo2: 89 },
      discriminators: { on_oxygen: "absent" },
    });
    expect(r.color).toBe("RED");
    expect(r.decisive_rule?.name).toBe("severe_hypoxia");
  });

  it("moderate hypoxia on room air is ORANGE (moderate_hypoxia)", () => {
    const r = run({
      age: { value: 5, unit: "years" },
      vitals: { spo2: 92 },
      discriminators: { on_oxygen: "absent" },
    });
    expect(r.color).toBe("ORANGE");
    expect(r.decisive_rule?.name).toBe("moderate_hypoxia");
  });

  it("hypoxemia despite oxygen is ORANGE (hypoxemia_on_oxygen)", () => {
    const r = run({
      age: { value: 5, unit: "years" },
      vitals: { spo2: 91 },
      discriminators: { on_oxygen: "present" },
    });
    expect(r.color).toBe("ORANGE");
    expect(r.decisive_rule?.name).toBe("hypoxemia_on_oxygen");
  });

  it("unknown on_oxygen does not satisfy 'absent': moderate_hypoxia does not fire at SpO2 92", () => {
    const r = run({
      age: { value: 5, unit: "years" },
      vitals: { spo2: 92 },
    });
    const names = r.all_fired_rules.map((f) => f.name);
    expect(names).not.toContain("moderate_hypoxia");
    expect(names).not.toContain("severe_hypoxia");
    expect(names).not.toContain("hypoxemia_on_oxygen");
  });
});

describe("PAT-based rules", () => {
  it("shock: abnormal circulation (PAT) + prolonged CRT is RED (shock_pat_circ_crt)", () => {
    const r = run({
      age: { value: 4, unit: "years" }, // preschool hr_normal [95, 140]
      vitals: { hr: 120, crt: 3 },
      discriminators: { pat_circulation_abnormal: "present" },
    });
    expect(r.color).toBe("RED");
    expect(r.decisive_rule?.name).toBe("shock_pat_circ_crt");
  });

  it("shock: abnormal circulation (PAT) + hypotension is RED (shock_pat_circ_hypotension)", () => {
    const r = run({
      age: { value: 4, unit: "years" }, // band min systolic BP = 70 + 2*4 = 78
      vitals: { systolic_bp: 70 },
      discriminators: { pat_circulation_abnormal: "present" },
    });
    expect(r.color).toBe("RED");
    expect(r.decisive_rule?.name).toBe("shock_pat_circ_hypotension");
  });

  it("ill appearance (PAT abnormal) is ORANGE with otherwise normal findings", () => {
    const r = run({
      age: { value: 4, unit: "years" },
      vitals: { hr: 120, rr: 27, temp: 37.0, spo2: 98 },
      discriminators: { pat_appearance_abnormal: "present" },
    });
    expect(r.color).toBe("ORANGE");
    expect(r.decisive_rule?.name).toBe("ill_appearance");
  });
});

describe("infant hydration rules", () => {
  it("infant (<6mo) with poor feeding is ORANGE (infant_poor_feeding)", () => {
    const r = run({
      age: { value: 4, unit: "months" },
      discriminators: { poor_feeding: "present" },
    });
    expect(r.color).toBe("ORANGE");
    expect(r.decisive_rule?.name).toBe("infant_poor_feeding");
  });

  it("infant (<6mo) with reduced urine output is ORANGE (infant_reduced_urine)", () => {
    const r = run({
      age: { value: 3, unit: "months" },
      discriminators: { reduced_urine_output: "present" },
    });
    expect(r.color).toBe("ORANGE");
    expect(r.decisive_rule?.name).toBe("infant_reduced_urine");
  });
});

describe("pain score rules", () => {
  it("severe pain score (7-10) is ORANGE (severe_pain)", () => {
    const r = run({
      age: { value: 8, unit: "years" },
      vitals: { pain_score: 8 },
    });
    expect(r.color).toBe("ORANGE");
    expect(r.decisive_rule?.name).toBe("severe_pain");
  });

  it("moderate pain score (4-6) is YELLOW (moderate_pain)", () => {
    const r = run({
      age: { value: 8, unit: "years" },
      vitals: { pain_score: 5 },
    });
    expect(r.color).toBe("YELLOW");
    expect(r.decisive_rule?.name).toBe("moderate_pain");
  });
});
