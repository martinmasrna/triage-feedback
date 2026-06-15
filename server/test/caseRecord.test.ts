import { describe, expect, it } from "vitest";
import { loadRuleSet } from "../src/engine/index.js";
import { assembleCase, mergeFindings } from "../src/domain/derive.js";
import type { EnteredCase, ExtractionResult, StoredCase, Verdict } from "../src/domain/caseTypes.js";
import { InMemoryCaseStore, selectCases } from "../src/store/caseStore.js";
import { toCSV, toJSON } from "../src/export/exportCases.js";

const rules = loadRuleSet();

function entered(over: Partial<EnteredCase> = {}): EnteredCase {
  return {
    age: { value: 5, unit: "years" },
    complaint_category: "breathing",
    vitals: {},
    discriminators: {},
    ...over,
  };
}

describe("mergeFindings (doctor wins)", () => {
  it("doctor-typed vitals override extracted ones; blanks fall back to extraction", () => {
    const e = entered({ vitals: { spo2: 97 } });
    const extraction: ExtractionResult = {
      vitals: { spo2: 88, hr: 120 },
      discriminators: {},
      model_id: "test",
      prompt_version: "test",
      ok: true,
    };
    const merged = mergeFindings(e, extraction);
    expect(merged.vitals.spo2).toBe(97); // doctor wins
    expect(merged.vitals.hr).toBe(120); // extraction fills the blank
  });

  it("explicit doctor discriminator wins; 'unknown' defers to extraction", () => {
    const e = entered({ discriminators: { stridor: "absent", apnoea: "unknown" } });
    const extraction: ExtractionResult = {
      vitals: {},
      discriminators: { stridor: "present", apnoea: "present" },
      model_id: "test",
      prompt_version: "test",
      ok: true,
    };
    const merged = mergeFindings(e, extraction);
    expect(merged.discriminators.stridor).toBe("absent"); // doctor's explicit value wins
    expect(merged.discriminators.apnoea).toBe("present"); // doctor left unknown → extraction
  });

  it("works with no extraction at all", () => {
    const merged = mergeFindings(entered({ vitals: { hr: 100 } }), null);
    expect(merged.vitals.hr).toBe(100);
    expect(merged.discriminators).toEqual({});
  });
});

describe("assembleCase", () => {
  it("merges, runs the engine on effective findings, stamps provenance", () => {
    // Young infant + fever → system ORANGE (fever_young_infant). Doctor disagrees.
    const c = assembleCase({
      entered: entered({ age: { value: 2, unit: "months" }, complaint_category: "fever", vitals: { temp: 38.6 } }),
      secondOpinion: { color: "ORANGE", model_id: "gemma-test", prompt_version: "so-1" },
      verdict: { agrees: false, comment: "looks septic, I'd go red" },
      ruleSet: rules,
      id: "case-1",
      now: new Date("2026-06-09T10:00:00.000Z"),
    });

    expect(c.decision.color).toBe("ORANGE");
    expect(c.decision.decisive?.name).toBe("fever_young_infant");
    expect(c.verdict?.agrees).toBe(false);
    expect(c.verdict?.comment).toBe("looks septic, I'd go red");
    expect(c.source).toBe("doctor");
    expect(c.effective.vitals.temp).toBe(38.6);
    expect(c.second_opinion?.color).toBe("ORANGE");
    expect(c.provenance.rule_set_version).toBe("0.1.0-draft");
    expect(c.provenance.second_opinion_model_id).toBe("gemma-test");
    expect(c.provenance.extractor_model_id).toBeNull(); // no extraction supplied
    expect(c.created_at).toBe("2026-06-09T10:00:00.000Z");
  });

  it("a pending AI-generated case has source ai_generated and verdict null", () => {
    const c = assembleCase({
      entered: entered({ complaint_category: "fever", vitals: { temp: 39.2 } }),
      extraction: { vitals: {}, discriminators: {}, model_id: "gemma-test", prompt_version: "p1", ok: true },
      secondOpinion: { color: "YELLOW", model_id: "gemma-test", prompt_version: "so-1" },
      verdict: null,
      source: "ai_generated",
      ruleSet: rules,
      id: "case-pending",
    });

    expect(c.source).toBe("ai_generated");
    expect(c.verdict).toBeNull();
    expect(c.decision.color).toBeTruthy();
  });

  it("a doctor-entered finding can change the decision vs what the LLM read", () => {
    // LLM read 'apnoea present' (would be RED), but the doctor explicitly marks it absent.
    const c = assembleCase({
      entered: entered({ discriminators: { apnoea: "absent" }, vitals: { spo2: 98 } }),
      extraction: { vitals: {}, discriminators: { apnoea: "present" }, model_id: "gemma-test", prompt_version: "p1", ok: true },
      verdict: { agrees: true },
      ruleSet: rules,
    });
    // doctor's "absent" wins → apnoea rule does NOT fire
    expect(c.effective.discriminators.apnoea).toBe("absent");
    expect(c.decision.fired.map((f) => f.name)).not.toContain("apnoea");
    expect(c.provenance.extractor_model_id).toBe("gemma-test");
  });
});

describe("InMemoryCaseStore + selectCases", () => {
  function make(id: string, agrees: boolean, spo2: number, at: string): StoredCase {
    const v: Verdict = { agrees };
    return assembleCase({
      entered: entered({ vitals: { spo2 }, discriminators: { on_oxygen: "absent" } }),
      verdict: v,
      ruleSet: rules,
      id,
      now: new Date(at),
    });
  }

  it("saves, gets, counts, lists newest-first, and filters disagreements", () => {
    const store = new InMemoryCaseStore();
    const agree = make("a", true, 99, "2026-06-09T09:00:00Z");
    const disagree = make("b", false, 80, "2026-06-09T10:00:00Z");
    expect(disagree.decision.color).toBe("RED");

    store.save(agree);
    store.save(disagree);

    expect(store.count()).toBe(2);
    expect(store.get("a")?.id).toBe("a");
    expect(store.list().map((c) => c.id)).toEqual(["b", "a"]); // newest first
    expect(store.list({ disagreementsOnly: true }).map((c) => c.id)).toEqual(["b"]);
  });

  it("selectCases orders and filters a raw iterable", () => {
    const a = make("a", true, 99, "2026-06-09T09:00:00Z");
    const b = make("b", false, 80, "2026-06-09T11:00:00Z");
    expect(selectCases([a, b]).map((c) => c.id)).toEqual(["b", "a"]);
    expect(selectCases([a, b], { disagreementsOnly: true }).map((c) => c.id)).toEqual(["b"]);
  });

  it("a pending case (verdict null) is never a 'disagreement'", () => {
    const a = make("a", false, 80, "2026-06-09T09:00:00Z"); // real disagreement
    const pending = assembleCase({
      entered: entered({ vitals: { spo2: 80 }, discriminators: { on_oxygen: "absent" } }),
      verdict: null,
      source: "ai_generated",
      ruleSet: rules,
      id: "pending",
      now: new Date("2026-06-09T11:00:00Z"),
    });
    expect(selectCases([a, pending], { disagreementsOnly: true }).map((c) => c.id)).toEqual(["a"]);
  });
});

describe("export", () => {
  const c = assembleCase({
    entered: entered({
      note: 'Dieťa "ťažko" dýcha, vidno zaťahovanie\nmedzirebrových priestorov, teplota stúpa',
      complaint_text: "kašeľ, dýchavičnosť",
      vitals: { spo2: 80 },
      discriminators: { on_oxygen: "absent" },
    }),
    verdict: { agrees: false, comment: "I'd say orange, not red" },
    ruleSet: rules,
    id: "exp-1",
    now: new Date("2026-06-09T10:00:00.000Z"),
  });

  it("toJSON round-trips losslessly", () => {
    const parsed = JSON.parse(toJSON([c]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("exp-1");
    expect(parsed[0].decision.fired.length).toBeGreaterThan(0);
  });

  it("toCSV emits a header and escapes commas, quotes, and newlines", () => {
    const csv = toCSV([c]);
    expect(csv.startsWith("id,created_at,source,age_value")).toBe(true);
    const [, ...rest] = csv.split("\r\n");
    expect(rest).toHaveLength(1);
    const line = rest[0]!;
    // the note has a quote, comma and newline → must be wrapped in quotes with doubled quotes
    expect(line).toContain('""ťažko""');
    expect(line).toContain("exp-1");
    expect(line).toContain("severe_hypoxia"); // fired rule appears in the joined column
    expect(line).toContain("false"); // doctor_agrees column
    // the embedded \n stays inside a quoted field, so splitting on the \r\n record separator
    // still yields exactly header + one record (the newline does NOT break the row)
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(line).toContain("\n"); // the raw newline is preserved inside the quoted cell
  });
});
