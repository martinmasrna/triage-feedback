// Thin boundary around "ask a local LLM for a completion". The reader depends only on this
// interface, so the model underneath (a llama.cpp server, a different model, or a mock) can be
// swapped without touching extraction logic.

export interface LlmCompletionRequest {
  system?: string;
  user: string;
  /** When given, the model is constrained to return JSON matching this schema. */
  schema?: object;
  temperature?: number;
}

export interface LlmClient {
  readonly modelId: string;
  complete(req: LlmCompletionRequest): Promise<string>;
}

export interface LlamaCppOptions {
  baseUrl: string;
  model?: string;
  modelId?: string;
  timeoutMs?: number;
}

/** Talks to a llama.cpp server over its OpenAI-compatible /v1/chat/completions endpoint. */
export class LlamaCppClient implements LlmClient {
  readonly modelId: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts: LlamaCppOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.model = opts.model ?? "local";
    this.modelId = opts.modelId ?? opts.model ?? "llama.cpp";
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  async complete(req: LlmCompletionRequest): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.user });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: req.temperature ?? 0,
    };
    if (req.schema) {
      // llama.cpp accepts an OpenAI-style json_schema response_format and enforces it via a grammar.
      body.response_format = { type: "json_schema", json_schema: { name: "out", schema: req.schema, strict: true } };
    }

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`llama.cpp returned ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("llama.cpp response had no message content");
    return content;
  }
}

/** Test/dev double: returns whatever the supplied handler produces for each request. */
export class MockLlmClient implements LlmClient {
  readonly modelId: string;
  constructor(
    private readonly handler: (req: LlmCompletionRequest) => string | Promise<string>,
    modelId = "mock",
  ) {
    this.modelId = modelId;
  }
  complete(req: LlmCompletionRequest): Promise<string> {
    return Promise.resolve(this.handler(req));
  }
}
