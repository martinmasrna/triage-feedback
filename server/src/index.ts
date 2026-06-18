// Public surface of the server library so far.
// NOTE: SqliteCaseStore is intentionally NOT re-exported here — it pulls in the native
// better-sqlite3 binary, so import it directly from "./store/sqliteCaseStore.js" where needed.

export * from "./engine/index.js";
export * from "./domain/caseTypes.js";
export { mergeFindings, assembleCase, type AssembleArgs } from "./domain/derive.js";
export { loadSeeds, parseSeeds, DEFAULT_SEEDS_PATH, type SeedCase } from "./domain/seeds.js";
export {
  InMemoryCaseStore,
  selectCases,
  type CaseStore,
  type ListFilter,
} from "./store/caseStore.js";
export { toJSON, toCSV } from "./export/exportCases.js";

// LLM extractor ("reader"). LlamaCppClient/MockLlmClient use global fetch only — no native deps.
export {
  type LlmClient,
  type LlmCompletionRequest,
  type LlamaCppOptions,
  LlamaCppClient,
  MockLlmClient,
} from "./llm/client.js";
export {
  type Reader,
  type ReaderPrompts,
  type LoadReaderPromptsOptions,
  LlmReader,
  StubReader,
  loadReaderPrompts,
} from "./llm/reader.js";
export {
  type LoadedPrompt,
  type RenderedPrompt,
  type PromptMeta,
  loadPrompt,
  parsePrompt,
  renderPrompt,
  fill,
  DEFAULT_PROMPTS_DIR,
} from "./llm/prompt.js";
export { buildExtractionSchema, buildSecondOpinionSchema } from "./llm/schema.js";

// HTTP API.
export { createApp, type ApiDeps } from "./api/app.js";
