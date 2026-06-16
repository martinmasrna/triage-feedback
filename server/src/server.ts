import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { basicAuth } from "hono/basic-auth";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadRuleSet } from "./engine/index.js";
import { SqliteCaseStore } from "./store/sqliteCaseStore.js";
import { buildReader, loadServerEnv } from "./llm/buildReader.js";
import { loadSeeds } from "./domain/seeds.js";
import { createApp } from "./api/app.js";

loadServerEnv();

/**
 * Env:
 *   PORT             default 8787
 *   DB_PATH          default ./cases.db
 *   RULES_PATH       optional (defaults to bundled provisional rules)
 *   SEEDS_PATH       optional (defaults to bundled server/seeds/seeds.yaml; missing → no seeds)
 *   LLAMA_URL        llama.cpp base URL (omit → StubReader)
 *   LLAMA_MODEL      stamped into provenance
 *   PROMPT_LANG      "en" (default) or "sk"
 *
 * Safety:
 *   ADMIN_ENABLED    "true" to enable /api/admin/* (otherwise 404)
 *   ADMIN_USER       Basic Auth user (optional if admin disabled)
 *   ADMIN_PASS       Basic Auth pass
 *   ADMIN_UI_GATE    "true" to also require Basic Auth for the /admin UI route
 *   CORS_ORIGIN      Allowed origin for /api/* (dev only; omit in prod)
 *   MAX_BODY_BYTES   default 65536
 *   WEB_ROOT         Serve built web (e.g. ../web/dist) at same origin
 *   NODE_ENV         "production" recommended for prod
 */

const ruleSet = loadRuleSet(process.env.RULES_PATH);
const store = new SqliteCaseStore(process.env.DB_PATH ?? "cases.db");
const reader = buildReader();
const seeds = loadSeeds(process.env.SEEDS_PATH);

const ADMIN_ENABLED = process.env.ADMIN_ENABLED === "true";
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const ADMIN_UI_GATE = process.env.ADMIN_UI_GATE === "true";
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const MAX_BODY = Number.isFinite(Number(process.env.MAX_BODY_BYTES))
  ? Number(process.env.MAX_BODY_BYTES)
  : 64 * 1024;

const csp =
  "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:";

const app = createApp(
  { store, reader, ruleSet, seeds },
  {
    adminEnabled: ADMIN_ENABLED,
    adminAuth: ADMIN_USER && ADMIN_PASS ? { username: ADMIN_USER, password: ADMIN_PASS } : undefined,
    corsOrigin: CORS_ORIGIN,
    csp,
    maxBodyBytes: MAX_BODY,
  },
);

// Serve the built UI from the same origin.
// Gate the /admin UI route(s) first, then static, then SPA fallback.
if (process.env.WEB_ROOT) {
  if (ADMIN_UI_GATE && ADMIN_ENABLED && ADMIN_USER && ADMIN_PASS) {
    // Protect both /admin and /admin/* so the prompt shows even on the base path.
    app.use("/admin", basicAuth({ username: ADMIN_USER, password: ADMIN_PASS }));
    app.use("/admin/*", basicAuth({ username: ADMIN_USER, password: ADMIN_PASS }));
  }

  // Static files (JS/CSS/assets and index.html for "/")
  app.use("/*", serveStatic({ root: process.env.WEB_ROOT }));

  // SPA fallback: serve index.html for any unknown route (e.g. /admin, /case/123)
  app.get("/*", async (c) => {
    const webRoot = process.env.WEB_ROOT!;
    const indexPath = path.resolve(process.cwd(), webRoot, "index.html");
    try {
      const html = await readFile(indexPath, "utf-8");
      return c.html(html);
    } catch {
      return c.text("Not found", 404);
    }
  });
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`[triage] API listening on http://127.0.0.1:${port} (rules ${ruleSet.version})`);