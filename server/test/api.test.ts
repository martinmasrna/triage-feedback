import { beforeEach, describe, expect, it } from "vitest";
import { loadRuleSet } from "../src/engine/index.js";
import { assembleCase } from "../src/domain/derive.js";
import { InMemoryCaseStore } from "../src/store/caseStore.js";
import { StubReader, LlmReader, loadReaderPrompts, type Reader } from "../src/llm/reader.js";
import { MockLlmClient, type LlmCompletionRequest } from "../src/llm/client.js";
import { createApp } from "../src/api/app.js";

const ruleSet = loadRuleSet();

function makeApp(reader: Reader = new StubReader(), opts: { adminEnabled?: boolean } = {}) {
  const store = new InMemoryCaseStore();
  const app = createApp({ store, reader, ruleSet }, opts);
  return { app, store };
}

function post(app: ReturnType<typeof makeApp>["app"], path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const hypoxiaCase = {
  age: { value: 4, unit: "years" },
  complaint_category: "respiratory",
  note: "Ťažko dýcha.",
  vitals: { spo2: 80 },
  discriminators: { on_oxygen: "absent" },
};

describe("GET /api/health and /api/form-options", () => {
  it("health returns ok", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("form-options exposes the vocabulary the UI needs", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/form-options");
    const body = (await res.json()) as any;
    expect(body.complaint_categories.length).toBeGreaterThan(3);
    expect(body.discriminators.some((d: any) => d.key === "apnoea")).toBe(true);
    expect(body.vitals.some((v: any) => v.key === "spo2")).toBe(true);
    expect(body.colors).toContain("RED");
  });
});

describe("POST /api/evaluate", () => {
  it("runs the engine and returns the decision + a draftId", async () => {
    const { app } = makeApp();
    const res = await post(app, "/api/evaluate", hypoxiaCase);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.draftId).toBeTruthy();
    expect(body.decision.color).toBe("RED");
    expect(body.decision.decisive.name).toBe("severe_hypoxia");
    expect(body.extraction_ok).toBe(true); // StubReader
  });

  it("rejects an invalid case with 400", async () => {
    const { app } = makeApp();
    const res = await post(app, "/api/evaluate", { complaint_category: "respiratory" }); // no age
    expect(res.status).toBe(400);
  });

  it("stitches the reader into the decision (extracted finding changes the color)", async () => {
    // Normal vitals, but the mock model reads 'apnoea present' from the note → engine returns RED.
    const handler = (req: LlmCompletionRequest) => {
      const schema = req.schema as { properties?: Record<string, unknown> } | undefined;
      if (schema?.properties?.color) return JSON.stringify({ color: "ORANGE" });
      return JSON.stringify({ vitals: {}, discriminators: { apnoea: "present" } });
    };
    const reader = new LlmReader(new MockLlmClient(handler, "mock-model"), loadReaderPrompts());
    const { app } = makeApp(reader);

    const res = await post(app, "/api/evaluate", {
      age: { value: 1, unit: "years" },
      complaint_category: "respiratory",
      note: "Občas prestáva dýchať.",
      vitals: { spo2: 98 },
    });
    const body = (await res.json()) as any;
    expect(body.decision.color).toBe("RED");
    expect(body.decision.decisive.name).toBe("apnoea");
  });
});

describe("POST /api/extract", () => {
  it("reads the note into structured findings without deciding a color", async () => {
    const handler = (_req: LlmCompletionRequest) =>
      JSON.stringify({ vitals: { spo2: 88 }, discriminators: { apnoea: "present" } });
    const reader = new LlmReader(new MockLlmClient(handler, "mock-model"), loadReaderPrompts());
    const { app } = makeApp(reader);

    const res = await post(app, "/api/extract", {
      age: { value: 1, unit: "years" },
      complaint_category: "respiratory",
      note: "Občas prestáva dýchať.",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.vitals.spo2).toBe(88);
    expect(body.discriminators.apnoea).toBe("present");
    expect(body.model_id).toBe("mock-model");
    expect("color" in body).toBe(false); // extraction never decides
  });

  it("rejects an invalid case with 400", async () => {
    const { app } = makeApp();
    const res = await post(app, "/api/extract", { complaint_category: "respiratory" }); // no age
    expect(res.status).toBe(400);
  });
});

describe("POST /api/evaluate with a pre-computed extraction (pre-fill flow)", () => {
  const aiReadApnoea = {
    vitals: {},
    discriminators: { apnoea: "present" },
    ok: true,
    model_id: "mock-model",
    prompt_version: "test",
  };

  it("decides on the entered form — a finding the doctor cleared does NOT fire", async () => {
    const { app, store } = makeApp(); // reader unused: extraction is supplied by the client
    const res = await post(app, "/api/evaluate", {
      age: { value: 1, unit: "years" },
      complaint_category: "respiratory",
      note: "Občas prestáva dýchať.",
      vitals: {},
      discriminators: { apnoea: "unknown" }, // doctor reviewed the pre-fill and cleared it
      extraction: aiReadApnoea,
    });
    const body = (await res.json()) as any;
    expect(body.decision.decisive).toBeNull();
    expect(body.decision.color).not.toBe("RED");
    expect(body.extraction_ok).toBe(true);

    // The original AI read is stored verbatim, distinct from what the doctor entered.
    const saved = (await (
      await post(app, "/api/cases", { draftId: body.draftId, verdict: { agrees: true } })
    ).json()) as any;
    const full = store.get(saved.id)!;
    expect(full.extraction!.discriminators.apnoea).toBe("present"); // what the AI read
    expect(full.effective.discriminators.apnoea).toBe("unknown"); // what the engine decided on
    expect(full.entered.discriminators.apnoea).toBe("unknown"); // what the doctor entered
  });

  it("keeps a finding the doctor accepted (pre-filled and left in the form)", async () => {
    const { app } = makeApp();
    const res = await post(app, "/api/evaluate", {
      age: { value: 1, unit: "years" },
      complaint_category: "respiratory",
      note: "Občas prestáva dýchať.",
      vitals: {},
      discriminators: { apnoea: "present" }, // pre-filled by the AI, accepted by the doctor
      extraction: aiReadApnoea,
    });
    const body = (await res.json()) as any;
    expect(body.decision.color).toBe("RED");
    expect(body.decision.decisive.name).toBe("apnoea");
  });

  it("does not call the reader when the extraction is supplied", async () => {
    let extractCalls = 0;
    const handler = (req: LlmCompletionRequest) => {
      const schema = req.schema as { properties?: Record<string, unknown> } | undefined;
      if (schema?.properties?.color) return JSON.stringify({ color: "GREEN" }); // second opinion
      extractCalls += 1;
      return JSON.stringify({ vitals: {}, discriminators: {} });
    };
    const reader = new LlmReader(new MockLlmClient(handler, "mock-model"), loadReaderPrompts());
    const { app } = makeApp(reader);

    await post(app, "/api/evaluate", {
      age: { value: 1, unit: "years" },
      complaint_category: "respiratory",
      note: "x",
      vitals: {},
      discriminators: {},
      extraction: aiReadApnoea,
    });
    expect(extractCalls).toBe(0); // the note was already read at /extract
  });
});

describe("POST /api/cases (save) and retrieval", () => {
  let app: ReturnType<typeof makeApp>["app"];

  beforeEach(() => {
    app = makeApp().app;
  });

  async function evaluateAndDraft(caseBody: unknown): Promise<string> {
    const res = await post(app, "/api/evaluate", caseBody);
    return ((await res.json()) as any).draftId as string;
  }

  it("saves a case and makes it retrievable", async () => {
    const draftId = await evaluateAndDraft(hypoxiaCase); // system RED
    const res = await post(app, "/api/cases", {
      draftId,
      verdict: { agrees: true },
    });
    expect(res.status).toBe(201);
    const saved = (await res.json()) as any;
    expect(saved.id).toBeTruthy();
    expect(saved.verdict.agrees).toBe(true);
    expect(saved.decision.color).toBe("RED");
    // Save returns the doctor-facing projection: no silent data leaks back.
    expect("second_opinion" in saved).toBe(false);
    expect("extraction" in saved).toBe(false);
    expect("effective" in saved).toBe(false);

    const list = (await (await app.request("/api/cases")).json()) as any[];
    expect(list).toHaveLength(1);
    const one = (await (await app.request(`/api/cases/${saved.id}`)).json()) as any;
    expect(one.id).toBe(saved.id);
  });

  it("accepts a disagreement without a comment (comment is optional)", async () => {
    const draftId = await evaluateAndDraft(hypoxiaCase); // system RED
    const res = await post(app, "/api/cases", {
      draftId,
      verdict: { agrees: false },
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).verdict.agrees).toBe(false);
  });

  it("rejects an unknown draftId with 409", async () => {
    const res = await post(app, "/api/cases", {
      draftId: "does-not-exist",
      verdict: { agrees: true },
    });
    expect(res.status).toBe(409);
  });

  it("filters the list to disagreements", async () => {
    const d1 = await evaluateAndDraft(hypoxiaCase);
    await post(app, "/api/cases", { draftId: d1, verdict: { agrees: true } });
    const d2 = await evaluateAndDraft(hypoxiaCase);
    await post(app, "/api/cases", { draftId: d2, verdict: { agrees: false, comment: "saturáciu prečítal zle" } });

    const all = (await (await app.request("/api/cases")).json()) as any[];
    expect(all).toHaveLength(2);
    const dis = (await (await app.request("/api/cases?disagreements=true")).json()) as any[];
    expect(dis).toHaveLength(1);
    expect(dis[0].verdict.agrees).toBe(false);
  });

  it("lets the doctor edit only the comment (PATCH)", async () => {
    const draftId = await evaluateAndDraft(hypoxiaCase);
    const saved = (await (
      await post(app, "/api/cases", { draftId, verdict: { agrees: false, comment: "pôvodný komentár" } })
    ).json()) as any;

    const res = await app.request(`/api/cases/${saved.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "po zvážení: systém rozhodol správne" }),
    });
    expect(res.status).toBe(200);
    const patched = (await res.json()) as any;
    expect(patched.verdict.comment).toBe("po zvážení: systém rozhodol správne");
    // The agree/disagree datapoint is untouched.
    expect(patched.verdict.agrees).toBe(false);

    const reread = (await (await app.request(`/api/cases/${saved.id}`)).json()) as any;
    expect(reread.verdict.comment).toBe("po zvážení: systém rozhodol správne");
  });

  it("lets the doctor revise the agree/disagree verdict (PATCH)", async () => {
    const draftId = await evaluateAndDraft(hypoxiaCase);
    const saved = (await (
      await post(app, "/api/cases", { draftId, verdict: { agrees: true, comment: "pôvodne súhlas" } })
    ).json()) as any;
    expect(saved.verdict.agrees).toBe(true);

    const res = await app.request(`/api/cases/${saved.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agrees: false, comment: "po zvážení nesúhlas" }),
    });
    expect(res.status).toBe(200);
    const patched = (await res.json()) as any;
    expect(patched.verdict.agrees).toBe(false);
    expect(patched.verdict.comment).toBe("po zvážení nesúhlas");

    const reread = (await (await app.request(`/api/cases/${saved.id}`)).json()) as any;
    expect(reread.verdict.agrees).toBe(false);
  });

  it("PATCH on a missing case is 404", async () => {
    const res = await app.request("/api/cases/nope", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "x" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("verdict_changed (silent revision tracking)", () => {
  function patch(app: ReturnType<typeof makeApp>["app"], id: string, body: unknown) {
    return app.request(`/api/cases/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function savedCase(app: ReturnType<typeof makeApp>["app"], agrees: boolean) {
    const draftId = ((await (await post(app, "/api/evaluate", hypoxiaCase)).json()) as any).draftId;
    return (await (await post(app, "/api/cases", { draftId, verdict: { agrees } })).json()) as any;
  }

  it("starts false, stays false on a comment-only edit, and never leaks to the doctor view", async () => {
    const { app, store } = makeApp();
    const saved = await savedCase(app, true);
    expect(store.get(saved.id)!.verdict_changed).toBe(false);
    expect("verdict_changed" in saved).toBe(false); // stripped by the doctor projection

    await patch(app, saved.id, { comment: "len komentár" });
    expect(store.get(saved.id)!.verdict_changed).toBe(false);
    const doctorView = (await (await app.request(`/api/cases/${saved.id}`)).json()) as any;
    expect("verdict_changed" in doctorView).toBe(false);
  });

  it("flips to true when the agree/disagree is revised, and stays true even if flipped back", async () => {
    const { app, store } = makeApp();
    const saved = await savedCase(app, true);

    await patch(app, saved.id, { agrees: false });
    expect(store.get(saved.id)!.verdict_changed).toBe(true);

    await patch(app, saved.id, { agrees: true }); // back to the original
    expect(store.get(saved.id)!.verdict_changed).toBe(true); // sticky
  });
});

describe("POST /api/cases/:id/verdict (pending AI-prefilled cases)", () => {
  it("submits the initial verdict for a pending case, then locks it", async () => {
    const { app, store } = makeApp();
    const pending = assembleCase({
      entered: {
        age: { value: 5, unit: "years" },
        complaint_category: "breathing",
        vitals: { spo2: 80 },
        discriminators: {},
      },
      verdict: null,
      source: "ai_generated",
      ruleSet,
      id: "pending-1",
    });
    store.save(pending);

    // appears in the doctor list with verdict: null and source: ai_generated
    const list = (await (await app.request("/api/cases")).json()) as any[];
    expect(list).toHaveLength(1);
    expect(list[0].verdict).toBeNull();
    expect(list[0].source).toBe("ai_generated");

    const res = await post(app, "/api/cases/pending-1/verdict", { agrees: true, comment: "súhlasím" });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as any;
    expect(updated.verdict).toEqual({ agrees: true, comment: "súhlasím" });

    // submitting again is rejected — use PATCH to edit the comment instead
    const again = await post(app, "/api/cases/pending-1/verdict", { agrees: false });
    expect(again.status).toBe(409);
  });

  it("404s for an unknown case", async () => {
    const { app } = makeApp();
    const res = await post(app, "/api/cases/nope/verdict", { agrees: true });
    expect(res.status).toBe(404);
  });

  it("PATCH (comment edit) on a pending case is rejected until a verdict exists", async () => {
    const { app, store } = makeApp();
    store.save(
      assembleCase({
        entered: {
          age: { value: 5, unit: "years" },
          complaint_category: "breathing",
          vitals: {},
          discriminators: {},
        },
        verdict: null,
        source: "ai_generated",
        ruleSet,
        id: "pending-2",
      }),
    );

    const res = await app.request("/api/cases/pending-2", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "x" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("admin endpoints expose the full record", () => {
  it("admin list/detail include the silent fields the doctor view strips", async () => {
    const { app } = makeApp(new StubReader(), { adminEnabled: true });
    const draftId = ((await (await post(app, "/api/evaluate", hypoxiaCase)).json()) as any).draftId;
    const saved = (await (
      await post(app, "/api/cases", { draftId, verdict: { agrees: true } })
    ).json()) as any;

    const adminOne = (await (await app.request(`/api/admin/cases/${saved.id}`)).json()) as any;
    expect("second_opinion" in adminOne).toBe(true);
    expect("extraction" in adminOne).toBe(true);
    expect("effective" in adminOne).toBe(true);
    expect(adminOne.provenance.rule_set_version).toBeTruthy();

    const adminList = (await (await app.request("/api/admin/cases")).json()) as any[];
    expect(adminList).toHaveLength(1);
    expect("extraction" in adminList[0]).toBe(true);
  });
});

describe("export endpoints", () => {
  it("export.csv and export.json return the saved cases", async () => {
    const { app } = makeApp(new StubReader(), { adminEnabled: true });
    const draftId = ((await (await post(app, "/api/evaluate", hypoxiaCase)).json()) as any).draftId;
    await post(app, "/api/cases", { draftId, verdict: { agrees: true } });

    const csv = await app.request("/api/admin/export.csv");
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain("cases.csv");
    const csvText = await csv.text();
    const header = csvText.split("\r\n")[0];
    expect(header).toContain("id,created_at");
    expect(header).toContain("doctor_agrees");
    expect(header).toContain("doctor_comment");
    expect(csvText.split("\r\n")).toHaveLength(2); // header + 1 case

    const json = await app.request("/api/admin/export.json");
    expect(json.headers.get("content-disposition")).toContain("cases.json");
    expect((JSON.parse(await json.text()) as any[]).length).toBe(1);
  });
});
