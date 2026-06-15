import { fileURLToPath } from "node:url";
import { LlamaCppClient } from "./client.js";
import { LlmReader, StubReader, loadReaderPrompts, type Reader } from "./reader.js";

// Load config from server/.env so the model URL etc. don't have to be retyped each run. Resolved
// relative to this file, so it works no matter what cwd the caller is launched from. Any value
// already set in the real environment wins over the file, so it can still be overridden ad-hoc
// (handy: the model endpoint host/port isn't stable). A missing .env is fine — falls back to
// StubReader.
export function loadServerEnv(): void {
  const presetEnv = { ...process.env }; // values present before loading the file
  try {
    process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
    // Explicit env wins: restore any var that was already set, so .env only fills the gaps.
    for (const [key, value] of Object.entries(presetEnv)) process.env[key] = value;
  } catch {
    // no .env file — use the real environment as-is
  }
}

// Builds the LLM reader from environment variables:
//   LLAMA_URL    llama.cpp server base URL, e.g. http://127.0.0.1:8080 (omit → StubReader)
//   LLAMA_MODEL  model id stamped into provenance
//   PROMPT_LANG  "en" (default) or "sk" — selects the prompt variant
export function buildReader(): Reader {
  const url = process.env.LLAMA_URL;
  if (!url) {
    console.warn("[triage] LLAMA_URL not set — using StubReader (no extraction, no second opinion).");
    return new StubReader();
  }
  const client = new LlamaCppClient({ baseUrl: url, model: process.env.LLAMA_MODEL, modelId: process.env.LLAMA_MODEL });
  const lang = process.env.PROMPT_LANG === "sk" ? "sk" : "en";
  const prompts =
    lang === "sk"
      ? loadReaderPrompts({ extraction: "extraction.sk", secondOpinion: "second-opinion.sk" })
      : loadReaderPrompts();
  return new LlmReader(client, prompts);
}
