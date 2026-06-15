import { describe, expect, it, vi } from "vitest";
import { MockLlmClient, type LlmCompletionRequest } from "../src/llm/client.js";
import { LlmReader, StubReader, loadReaderPrompts, type ReaderInput } from "../src/llm/reader.js";
import { buildExtractionSchema } from "../src/llm/schema.js";
import { DISCRIMINATOR_KEYS, VITAL_KEYS } from "../src/engine/vocabulary.js";

const prompts = loadReaderPrompts();

const input: ReaderInput = {
  age: { value: 2, unit: "years" },
  complaint_category: "breathing",
  complaint_text: "kašeľ",
  note: "Zhoršené dýchanie, vidno zaťahovanie. Bez kŕčov.",
  vitals: { spo2: 96 },
  discriminators: {},
};

/** Route mock responses: the second-opinion schema has a `color` property; extraction has `discriminators`. */
function routed(extractionJson: string, secondOpinionJson: string) {
  return (req: LlmCompletionRequest) => {
    const schema = req.schema as { properties?: Record<string, unknown> } | undefined;
    return schema?.properties?.color ? secondOpinionJson : extractionJson;
  };
}

describe("schema generation", () => {
  it("the extraction schema requires every vocabulary key", () => {
    const schema = buildExtractionSchema() as any;
    expect(schema.properties.discriminators.required).toEqual([...DISCRIMINATOR_KEYS]);
    expect(schema.properties.vitals.required).toEqual([...VITAL_KEYS]);
  });
});

describe("LlmReader.extract", () => {
  it("maps the model JSON to findings: keeps present/absent, drops null vitals", async () => {
    const json = JSON.stringify({
      vitals: { spo2: null, hr: 120, rr: null, temp: null, systolic_bp: null, diastolic_bp: null, crt: null, glucose: null },
      discriminators: { severe_resp_distress: "present", active_seizure: "absent", apnoea: "unknown" },
    });
    const reader = new LlmReader(new MockLlmClient(routed(json, "{}"), "gemma-test"), prompts);
    const result = await reader.extract(input);

    expect(result.ok).toBe(true);
    expect(result.model_id).toBe("gemma-test");
    expect(result.prompt_version).toBe("0.1.0-en");
    expect(result.vitals.hr).toBe(120);
    expect(result.vitals.spo2).toBeUndefined(); // null → dropped (unknown)
    expect(result.discriminators.severe_resp_distress).toBe("present");
    expect(result.discriminators.active_seizure).toBe("absent"); // negation preserved through the pipeline
    expect(result.discriminators.apnoea).toBe("unknown");
  });

  it("sends a constrained schema and the rendered note in the prompt", async () => {
    const handler = vi.fn(routed(JSON.stringify({ vitals: {}, discriminators: {} }), "{}"));
    const reader = new LlmReader(new MockLlmClient(handler), prompts);
    await reader.extract(input);

    const req = handler.mock.calls[0]![0];
    expect(req.schema).toBeTruthy();
    expect(req.user).toContain("Zhoršené dýchanie");
    expect(req.user).toContain("apnoea"); // injected discriminator list
    expect(req.user).not.toContain("{{");
    expect(req.temperature).toBe(0);
  });

  it("returns ok:false (continue on structured fields) when the model output is unparseable", async () => {
    const reader = new LlmReader(new MockLlmClient(() => "not json at all"), prompts);
    const result = await reader.extract(input);
    expect(result.ok).toBe(false);
    expect(result.vitals).toEqual({});
    expect(result.discriminators).toEqual({});
    expect(result.prompt_version).toBe("0.1.0-en");
  });

  it("returns ok:false when the client throws (e.g. server down)", async () => {
    const reader = new LlmReader(
      new MockLlmClient(() => {
        throw new Error("ECONNREFUSED");
      }),
      prompts,
    );
    const result = await reader.extract(input);
    expect(result.ok).toBe(false);
  });
});

describe("LlmReader.secondOpinion", () => {
  it("returns the model's color", async () => {
    const reader = new LlmReader(
      new MockLlmClient(routed("{}", JSON.stringify({ color: "ORANGE", rationale: "work of breathing" })), "gemma-test"),
      prompts,
    );
    const so = await reader.secondOpinion(input);
    expect(so?.color).toBe("ORANGE");
    expect(so?.model_id).toBe("gemma-test");
    expect(so?.prompt_version).toBe("0.1.0-en");
  });

  it("includes the case summary (entered vitals) in the prompt", async () => {
    const handler = vi.fn(routed("{}", JSON.stringify({ color: "GREEN" })));
    const reader = new LlmReader(new MockLlmClient(handler), prompts);
    await reader.secondOpinion(input);
    const req = handler.mock.calls[0]![0];
    expect(req.user).toContain("Saturácia O₂: 96 %"); // entered vital rendered into the summary
  });

  it("returns null on an invalid color", async () => {
    const reader = new LlmReader(new MockLlmClient(routed("{}", JSON.stringify({ color: "PURPLE" }))), prompts);
    expect(await reader.secondOpinion(input)).toBeNull();
  });

  it("returns null when the client throws", async () => {
    const reader = new LlmReader(
      new MockLlmClient(() => {
        throw new Error("down");
      }),
      prompts,
    );
    expect(await reader.secondOpinion(input)).toBeNull();
  });
});

describe("loadReaderPrompts variant selection", () => {
  it("defaults to the English prompts", () => {
    const p = loadReaderPrompts();
    expect(p.extraction.meta.version).toBe("0.1.0-en");
    expect(p.secondOpinion.meta.version).toBe("0.1.0-en");
  });

  it("loads the Slovak A/B variants when requested", () => {
    const p = loadReaderPrompts({ extraction: "extraction.sk", secondOpinion: "second-opinion.sk" });
    expect(p.extraction.meta.version).toBe("0.1.0-sk");
    expect(p.secondOpinion.meta.version).toBe("0.1.0-sk");
  });
});

describe("StubReader", () => {
  it("reads nothing and gives no opinion (pipeline runs on structured fields)", async () => {
    const reader = new StubReader();
    const ex = await reader.extract(input);
    expect(ex.ok).toBe(true);
    expect(ex.vitals).toEqual({});
    expect(await reader.secondOpinion(input)).toBeNull();
  });
});
