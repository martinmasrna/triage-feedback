import { Hono } from "hono";
import { cors } from "hono/cors";
import { basicAuth } from "hono/basic-auth";
import { bodyLimit } from "hono/body-limit";

import {
  COLORS,
  COMPLAINT_CATEGORIES,
  DISCRIMINATORS,
  VITALS,
  evaluate,
  type EvaluationResult,
  type RuleSet,
} from "../engine/index.js";

import type { EnteredCase, ExtractionResult, Findings, SecondOpinion, Verdict } from "../domain/caseTypes.js";
import { assembleCase, mergeFindings } from "../domain/derive.js";
import type { CaseStore, ListFilter } from "../store/caseStore.js";
import type { Reader } from "../llm/reader.js";
import { toCSV, toJSON } from "../export/exportCases.js";
import {
  EnteredCaseSchema,
  EvaluateRequestSchema,
  SaveSchema,
  VerdictPatchSchema,
  VerdictSchema,
} from "./schemas.js";
import { toDoctorCase } from "./doctorView.js";

export interface ApiDeps {
  store: CaseStore;
  reader: Reader;
  ruleSet: RuleSet;
}

export interface ApiOptions {
  adminEnabled?: boolean;
  adminAuth?: { username: string; password: string };
  corsOrigin?: string | string[];
  csp?: string;
  maxBodyBytes?: number;
}

interface Draft {
  input: EnteredCase;
  extraction: ExtractionResult;
  /** Findings the decision was taken on — carried so the save recomputes nothing and can't drift. */
  effective: Findings;
  secondOpinion: SecondOpinion | null;
  decision: EvaluationResult;
}

const MAX_DRAFTS = 500;

function parseListFilter(q: Record<string, string | undefined>): ListFilter {
  const filter: ListFilter = {};
  if (q.disagreements === "true") filter.disagreementsOnly = true;
  return filter;
}

export function createApp(deps: ApiDeps, opts: ApiOptions = {}): Hono {
  const app = new Hono();
  const drafts = new Map<string, Draft>();

  app.use("/*", async (c, next) => {
    if (opts.csp) c.header("Content-Security-Policy", opts.csp);
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Content-Type-Options", "nosniff");
    return next();
  });

  if (opts.corsOrigin) {
    app.use("/api/*", cors({ origin: opts.corsOrigin }));
  }

  if (opts.maxBodyBytes) {
    app.use(
      "/api/*",
      bodyLimit({
        maxSize: opts.maxBodyBytes,
        onError: (c) => c.json({ error: "Payload too large" }, 413),
      }),
    );
  }

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/form-options", (c) =>
    c.json({
      complaint_categories: COMPLAINT_CATEGORIES,
      discriminators: DISCRIMINATORS,
      vitals: VITALS,
      colors: COLORS,
    }),
  );

  // Read the note into structured findings (vitals + discriminators) without deciding anything.
  // Called on the step 1 → 2 transition to pre-fill the form. Returns the full extraction so the
  // browser can send it back at /evaluate, keeping the original AI read as the stored research record.
  app.post("/api/extract", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = EnteredCaseSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid case", details: parsed.error.flatten() }, 400);

    const extraction = await deps.reader.extract(parsed.data as EnteredCase);
    return c.json(extraction);
  });

  app.post("/api/evaluate", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = EvaluateRequestSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid case", details: parsed.error.flatten() }, 400);

    const { extraction: clientExtraction, ...input } = parsed.data as EnteredCase & {
      extraction?: ExtractionResult;
    };

    // Pre-fill flow: the note was already read and folded into the form, so the entered case is the
    // doctor's authoritative state — decide on it directly and store the original extraction as-is.
    // Legacy flow (no extraction sent): read the note here and fill the gaps under the entered case.
    let extraction: ExtractionResult;
    let effective: Findings;
    if (clientExtraction) {
      extraction = clientExtraction;
      effective = { vitals: input.vitals, discriminators: input.discriminators };
    } else {
      extraction = await deps.reader.extract(input);
      effective = mergeFindings(input, extraction);
    }

    const decision = evaluate(
      {
        age: input.age,
        vitals: effective.vitals,
        discriminators: effective.discriminators,
      },
      deps.ruleSet,
    );

    const secondOpinion = await deps.reader.secondOpinion(input);
    const draftId = crypto.randomUUID();
    drafts.set(draftId, { input, extraction, effective, secondOpinion, decision });

    if (drafts.size > MAX_DRAFTS) {
      const oldest = drafts.keys().next().value;
      if (oldest) drafts.delete(oldest);
    }

    return c.json({ draftId, decision, extraction_ok: extraction.ok });
  });

  app.post("/api/cases", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = SaveSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid submission", details: parsed.error.flatten() }, 400);

    const { draftId, verdict } = parsed.data;
    const draft = drafts.get(draftId);
    if (!draft) return c.json({ error: "Draft not found — re-evaluate the case" }, 409);

    const newCase = assembleCase({
      entered: draft.input,
      extraction: draft.extraction,
      effective: draft.effective,
      secondOpinion: draft.secondOpinion,
      verdict: verdict ? { agrees: verdict.agrees, comment: verdict.comment } : null,
      ruleSet: deps.ruleSet,
    });

    const stored = deps.store.create(newCase);
    drafts.delete(draftId);

    return c.json(toDoctorCase(stored), 201);
  });

  app.get("/api/cases", (c) => {
    const cases = deps.store.list(parseListFilter(c.req.query()));
    return c.json(cases.map(toDoctorCase));
  });

  app.get("/api/cases/:id", (c) => {
    const found = deps.store.get(Number(c.req.param("id")));
    return found ? c.json(toDoctorCase(found)) : c.json({ error: "Not found" }, 404);
  });

  app.post("/api/cases/:id/verdict", async (c) => {
    const existing = deps.store.get(Number(c.req.param("id")));
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
    deps.store.update(updated);
    return c.json(toDoctorCase(updated));
  });

  app.patch("/api/cases/:id", async (c) => {
    const existing = deps.store.get(Number(c.req.param("id")));
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.verdict === null) {
      return c.json({ error: "Case has no verdict yet — submit one via POST .../verdict first" }, 409);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = VerdictPatchSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid patch", details: parsed.error.flatten() }, 400);

    // A revision may change the agree/disagree, the comment, or both; an omitted agrees keeps the
    // current one (e.g. a comment-only edit).
    const nextAgrees = parsed.data.agrees ?? existing.verdict.agrees;
    const nextComment = parsed.data.comment !== undefined ? parsed.data.comment : existing.verdict.comment;
    const updated: typeof existing = {
      ...existing,
      verdict: { agrees: nextAgrees, comment: nextComment },
      // Silent, sticky: record that the decision was changed post-hoc (analysis only).
      verdict_changed: existing.verdict_changed || nextAgrees !== existing.verdict.agrees,
    };
    deps.store.update(updated);
    return c.json(toDoctorCase(updated));
  });

  if (!opts.adminEnabled) {
    app.all("/api/admin/*", (c) => c.json({ error: "Not found" }, 404));
  } else {
    if (opts.adminAuth) {
      app.use("/api/admin/*", basicAuth(opts.adminAuth));
    }

    app.get("/api/admin/cases", (c) => c.json(deps.store.list(parseListFilter(c.req.query()))));

    app.get("/api/admin/cases/:id", (c) => {
      const found = deps.store.get(Number(c.req.param("id")));
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
  }

  return app;
}