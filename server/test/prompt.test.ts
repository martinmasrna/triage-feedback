import { describe, expect, it } from "vitest";
import { fill, loadPrompt, parsePrompt, renderPrompt } from "../src/llm/prompt.js";

const SAMPLE = `---
id: demo
version: 1.2.3
temperature: 0
---

## System
You read notes. Respect negation.

## User
Note:
{{note}}
Findings: {{discriminator_list}}
`;

describe("parsePrompt", () => {
  it("parses frontmatter and the System/User sections", () => {
    const p = parsePrompt(SAMPLE);
    expect(p.meta.id).toBe("demo");
    expect(p.meta.version).toBe("1.2.3");
    expect(p.meta.temperature).toBe(0);
    expect(p.system).toBe("You read notes. Respect negation.");
    expect(p.user).toContain("Note:");
    expect(p.user).toContain("{{note}}");
    expect(p.user).not.toContain("## User");
  });

  it("throws without frontmatter", () => {
    expect(() => parsePrompt("just text")).toThrow(/frontmatter/i);
  });

  it("treats a body with no sections as the user prompt", () => {
    const p = parsePrompt("---\nid: x\nversion: 1\n---\nHello {{name}}");
    expect(p.system).toBeUndefined();
    expect(p.user).toBe("Hello {{name}}");
  });
});

describe("fill / renderPrompt", () => {
  it("substitutes known vars and blanks unknown placeholders", () => {
    expect(fill("a {{x}} b {{y}}", { x: "1" })).toBe("a 1 b ");
  });

  it("renders both sections", () => {
    const p = parsePrompt(SAMPLE);
    const r = renderPrompt(p, { note: "kašeľ", discriminator_list: "- apnoea" });
    expect(r.system).toBe("You read notes. Respect negation.");
    expect(r.user).toContain("kašeľ");
    expect(r.user).toContain("- apnoea");
    expect(r.user).not.toContain("{{");
  });
});

describe("loadPrompt (real files)", () => {
  it("loads the shipped English-default extraction and second-opinion prompts", () => {
    const extraction = loadPrompt("extraction");
    expect(extraction.meta.id).toBe("extraction");
    expect(extraction.meta.version).toBe("0.2.0-en");
    expect(extraction.system).toBeTruthy();
    expect(extraction.user).toContain("{{note}}");
    expect(extraction.user).toContain("{{discriminator_list}}");

    const so = loadPrompt("second-opinion");
    expect(so.meta.id).toBe("second-opinion");
    expect(so.user).toContain("{{case_summary}}");
  });

  it("loads the Slovak A/B variants with -sk versions", () => {
    expect(loadPrompt("extraction.sk").meta.version).toBe("0.2.0-sk");
    expect(loadPrompt("second-opinion.sk").meta.version).toBe("0.1.0-sk");
  });

  // The real word→score behaviour needs a live model; this guards the *instruction* that drives it,
  // so a future prompt edit can't silently revert to "explicit numbers only".
  it("instructs the model to map qualitative pain to a numeric pain_score", () => {
    for (const name of ["extraction", "extraction.sk"]) {
      const text = `${loadPrompt(name).system}`;
      expect(text).toContain("pain_score");
      expect(text).toContain("neznesiteľn"); // unbearable → top of the verbal scale
      // the old "explicit numbers only" prohibition must be gone
      expect(text).not.toMatch(/Do NOT infer a score|NEDOMÝŠĽAJ/);
    }
  });
});
