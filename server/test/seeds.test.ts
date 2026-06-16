import { describe, expect, it } from "vitest";
import { loadSeeds, parseSeeds } from "../src/domain/seeds.js";

describe("parseSeeds", () => {
  const valid = `
- id: my-case
  intent: "Test case"
  age: { value: 3, unit: years }
  complaint_category: fever
  note: "Horúčka od rána."
  vitals: { hr: 120, pain_score: 4 }
  discriminators: { moderate_dehydration: present }
  expected_color: YELLOW
  expected_rule: fever
`;

  it("parses a well-formed case and keeps author-supplied id/intent", () => {
    const seeds = parseSeeds(valid);
    expect(seeds).toHaveLength(1);
    const s = seeds[0]!;
    expect(s.id).toBe("my-case");
    expect(s.intent).toBe("Test case");
    expect(s.vitals).toEqual({ hr: 120, pain_score: 4 });
    expect(s.discriminators).toEqual({ moderate_dehydration: "present" });
    expect(s.expected_color).toBe("YELLOW");
  });

  it("derives a stable id and a human label when omitted", () => {
    const s = parseSeeds(`
- age: { value: 18, unit: months }
  complaint_category: respiratory
  note: "Kašeľ a sťažené dýchanie."
`)[0]!;
    expect(s.id).toBe("respiratory-18m-1");
    expect(s.intent).toContain("18");
    expect(s.vitals).toEqual({});
    expect(s.discriminators).toEqual({});
  });

  it("treats an empty file as no seeds", () => {
    expect(parseSeeds("")).toEqual([]);
  });

  it("rejects an unknown discriminator key (likely a typo in curated data)", () => {
    expect(() =>
      parseSeeds(`
- age: { value: 5, unit: years }
  complaint_category: fever
  note: "x"
  discriminators: { severe_panic: present }
`),
    ).toThrow(/unknown discriminator/);
  });

  it("rejects an unknown complaint category", () => {
    expect(() =>
      parseSeeds(`
- age: { value: 5, unit: years }
  complaint_category: tummyache
  note: "x"
`),
    ).toThrow(/Invalid seeds file/);
  });

  it("clamps-reject an out-of-range pain_score", () => {
    expect(() =>
      parseSeeds(`
- age: { value: 5, unit: years }
  complaint_category: fever
  note: "x"
  vitals: { pain_score: 12 }
`),
    ).toThrow(/Invalid seeds file/);
  });
});

describe("loadSeeds", () => {
  it("returns [] for a missing file rather than throwing", () => {
    expect(loadSeeds("./does-not-exist.yaml")).toEqual([]);
  });

  it("loads the bundled seed library", () => {
    const seeds = loadSeeds();
    expect(seeds.length).toBeGreaterThanOrEqual(1);
    for (const s of seeds) {
      expect(s.id).toBeTruthy();
      expect(s.intent).toBeTruthy();
      expect(s.note).toBeTruthy();
    }
  });
});
