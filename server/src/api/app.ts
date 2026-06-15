import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  COLORS,
  COMPLAINT_CATEGORIES,
  DISCRIMINATORS,
  VITALS,
  evaluate,
  type EvaluationResult,
  type RuleSet,
} from "../engine/index.js";
import type { EnteredCase, ExtractionResult, SecondOpinion, Verdict } from "../domain/caseTypes.js";
import { assembleCase, mergeFindings } from "../domain/derive.js";
import type { CaseStore, ListFilter } from "../store/caseStore.js";
import type { Reader } from "../llm/reader.js";
import { toCSV, toJSON } from "../export/exportCases.js";
import { CommentPatchSchema, EnteredCaseSchema, SaveSchema, VerdictSchema } from "./schemas.js";
import { toDoctorCase } from "./doctorView.js";

export interface ApiDeps {
  store: CaseStore;
  reader: Reader;
  ruleSet: RuleSet;
}

// Between /api/evaluate and /api/cases we hold the computed-but-not-yet-saved pieces server-side,
// keyed by a draftId. This keeps the silent extraction and second opinion OFF the doctor's browser
// (only the decision/explanation is returned) and avoids re-running the model at save time.
interface Draft {
  input: EnteredCase;
  extraction: ExtractionResult;
  secondOpinion: SecondOpinion | null;
  decision: EvaluationResult;
}

const MAX_DRAFTS = 500;

export function createApp(deps: ApiDeps): Hono {
  const app = new Hono();
  const drafts = new Map<string, Draft>();

  // Dev convenience: the Vue dev server runs on a different origin and needs CORS to call the API.
  // In production the same server serves the built UI (same origin), so this is harmless.
  app.use("/api/*", cors());

  app.get("/api/health", (c) => c.json({ ok: true }));

  // Tells the UI what to render: complaint categories, the finding/vital vocabulary, colors.
  app.get("/api/form-options", (c) =>
    c.json({
      complaint_categories: COMPLAINT_CATEGORIES,
      discriminators: DISCRIMINATORS,
      vitals: VITALS,
      colors: COLORS,
    }),
  );

  // Read the case (LLM) + decide (engine). Returns the decision + explanation the doctor sees,
  // plus a draftId to carry into save. The extraction/second opinion stay server-side.
  app.post("/api/evaluate", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = EnteredCaseSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid case", details: parsed.error.flatten() }, 400);

    const input = parsed.data as EnteredCase;
    const extraction = await deps.reader.extract(input);
    const effective = mergeFindings(input, extraction);
    const decision = evaluate(
      { age: input.age, vitals: effective.vitals, discriminators: effective.discriminators },
      deps.ruleSet,
    );
    const secondOpinion = await deps.reader.secondOpinion(input);

    const draftId = randomUUID();
    drafts.set(draftId, { input, extraction, secondOpinion, decision });
    if (drafts.size > MAX_DRAFTS) {
      const oldest = drafts.keys().next().value;
      if (oldest) drafts.delete(oldest);
    }

    // extraction_ok lets the UI show the "couldn't read the note" banner; the trace itself stays hidden.
    return c.json({ draftId, decision, extraction_ok: extraction.ok });
  });

  // Save a finished case: doctor's verdict + the draft → assembled record → store.
  app.post("/api/cases", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = SaveSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid submission", details: parsed.error.flatten() }, 400);

    const { draftId, verdict } = parsed.data;
    const draft = drafts.get(draftId);
    if (!draft) return c.json({ error: "Draft not found — re-evaluate the case" }, 409);

    const stored = assembleCase({
      entered: draft.input,
      extraction: draft.extraction,
      secondOpinion: draft.secondOpinion,
      verdict: {
        agrees: verdict.agrees,
        comment: verdict.comment,
      } satisfies Verdict,
      ruleSet: deps.ruleSet,
    });
    deps.store.save(stored);
    drafts.delete(draftId);
    // Doctor-facing: never echo back the silent second opinion / extraction.
    return c.json(toDoctorCase(stored), 201);
  });

  function parseListFilter(q: Record<string, string>): ListFilter {
    const filter: ListFilter = {};
    if (q.disagreements === "true") filter.disagreementsOnly = true;
    return filter;
  }

  // ── Doctor-facing reads: the sensitive fields are stripped at the boundary. ──
  app.get("/api/cases", (c) => {
    const cases = deps.store.list(parseListFilter(c.req.query()));
    return c.json(cases.map(toDoctorCase));
  });

  app.get("/api/cases/:id", (c) => {
    const found = deps.store.get(c.req.param("id"));
    return found ? c.json(toDoctorCase(found)) : c.json({ error: "Not found" }, 404);
  });

  // Submit the initial verdict for a pending (AI-prefilled, pre-triaged) case. Can only be done
  // once — a case that already has a verdict must go through PATCH (comment-only) instead.
  app.post("/api/cases/:id/verdict", async (c) => {
    const existing = deps.store.get(c.req.param("id"));
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.verdict !== null) {
      return c.json({ error: "Case already has a verdict — edit the comment via PATCH instead" }, 409);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = VerdictSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid verdict", details: parsed.error.flatten() }, 400);

    const updated: typeof existing = {
      ...existing,
      verdict: { agrees: parsed.data.agrees, comment: parsed.data.comment },
    };
    deps.store.save(updated);
    return c.json(toDoctorCase(updated));
  });

  // Edit a saved case: only the free-text comment. The agree/disagree itself stays immutable
  // (it is the primary datapoint, recorded at the moment of review).
  app.patch("/api/cases/:id", async (c) => {
    const existing = deps.store.get(c.req.param("id"));
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.verdict === null) {
      return c.json({ error: "Case has no verdict yet — submit one via POST .../verdict first" }, 409);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = CommentPatchSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid patch", details: parsed.error.flatten() }, 400);

    const updated: typeof existing = {
      ...existing,
      verdict: { ...existing.verdict, comment: parsed.data.comment },
    };
    deps.store.save(updated);
    return c.json(toDoctorCase(updated));
  });

  // ── Admin-facing reads + export: the full record, incl. second opinion / extraction. ──
  app.get("/api/admin/cases", (c) => c.json(deps.store.list(parseListFilter(c.req.query()))));

  app.get("/api/admin/cases/:id", (c) => {
    const found = deps.store.get(c.req.param("id"));
    return found ? c.json(found) : c.json({ error: "Not found" }, 404);
  });

  app.get("/api/admin/export.json", (c) => {
    c.header("Content-Type", "application/json; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="cases.json"');
    return c.body(toJSON(deps.store.list()));
  });

  app.get("/api/admin/export.csv", (c) => {
    c.header("Content-Type", "text/csv; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="cases.csv"');
    return c.body(toCSV(deps.store.list()));
  });

  return app;
}
