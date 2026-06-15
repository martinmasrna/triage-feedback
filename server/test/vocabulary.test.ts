import { describe, expect, it } from "vitest";
import { loadRuleSet } from "../src/engine/index.js";
import { DISCRIMINATOR_KEYS } from "../src/engine/vocabulary.js";

describe("vocabulary integrity", () => {
  it("every discriminator referenced by the rules is defined in the vocabulary (no typos)", () => {
    const rules = loadRuleSet();
    const known = new Set(DISCRIMINATOR_KEYS);
    const used = new Set<string>();
    for (const rule of rules.rules) {
      for (const cond of rule.all) {
        if (cond.kind === "discriminator") used.add(cond.discriminator);
      }
    }
    const unknown = [...used].filter((k) => !known.has(k));
    expect(unknown).toEqual([]);
    // sanity: the rules actually exercise several discriminators
    expect(used.size).toBeGreaterThan(5);
  });
});
