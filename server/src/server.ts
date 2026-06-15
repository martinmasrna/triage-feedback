import { serve } from "@hono/node-server";
import { loadRuleSet } from "./engine/index.js";
import { SqliteCaseStore } from "./store/sqliteCaseStore.js";
import { buildReader, loadServerEnv } from "./llm/buildReader.js";
import { createApp } from "./api/app.js";

// Load config from server/.env so the model URL etc. don't have to be retyped each run (works no
// matter what cwd the server is launched from — npm start, npm run dev, the .bat).
loadServerEnv();

// Production entry point. Wires the real dependencies from environment variables and starts the
// HTTP server. With no LLAMA_URL set it uses StubReader, so the whole app runs without a model.
//
//   PORT         HTTP port (default 8787)
//   DB_PATH      SQLite file (default ./cases.db)
//   RULES_PATH   rule YAML (default the shipped provisional set)
//   LLAMA_URL    llama.cpp server base URL, e.g. http://127.0.0.1:8080 (omit → StubReader)
//   LLAMA_MODEL  model id stamped into provenance
//   PROMPT_LANG  "en" (default) or "sk" — selects the prompt variant

const ruleSet = loadRuleSet(process.env.RULES_PATH);
const store = new SqliteCaseStore(process.env.DB_PATH ?? "cases.db");
const reader = buildReader();
const app = createApp({ store, reader, ruleSet });

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`[triage] API listening on http://127.0.0.1:${port}  (rules ${ruleSet.version})`);
