import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// Prompts are editable Markdown files with YAML frontmatter, so they can be tuned/versioned
// independently of code. Frontmatter = metadata (id, version, temperature). Body = the prompt,
// optionally split into "## System" and "## User" sections, with {{placeholders}} substituted
// at render time.

export const DEFAULT_PROMPTS_DIR = fileURLToPath(new URL("../../prompts/", import.meta.url));

export interface PromptMeta {
  id: string;
  version: string;
  description?: string;
  temperature?: number;
}

export interface LoadedPrompt {
  meta: PromptMeta;
  system?: string;
  user: string;
}

export interface RenderedPrompt {
  system?: string;
  user: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parsePrompt(text: string): LoadedPrompt {
  const match = FRONTMATTER.exec(text);
  if (!match) throw new Error("Prompt is missing YAML frontmatter (--- ... --- at the top)");

  const raw = parse(match[1]!) as Record<string, unknown> | null;
  if (!raw || raw.id == null || raw.version == null) {
    throw new Error("Prompt frontmatter must define 'id' and 'version'");
  }
  // Coerce id/version to strings — YAML parses e.g. `version: 1` as a number.
  const meta: PromptMeta = {
    id: String(raw.id),
    version: String(raw.version),
    description: raw.description == null ? undefined : String(raw.description),
    temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
  };

  const body = match[2]!;
  const system = section(body, "System");
  const user = section(body, "User");

  return { meta, system, user: user ?? body.trim() };
}

/** Extract the text under a "## <name>" heading, up to the next "## " heading or end. */
function section(body: string, name: string): string | undefined {
  // No 'm' flag: `$` anchors to end-of-string, so the non-greedy body grows until the next
  // "## " heading (if any) or the end of the file.
  const re = new RegExp(`(?:^|\\n)##\\s*${name}\\s*\\r?\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const m = re.exec(body);
  return m ? m[1]!.trim() : undefined;
}

export function loadPrompt(name: string, dir: string = DEFAULT_PROMPTS_DIR): LoadedPrompt {
  return parsePrompt(readFileSync(`${dir}${name}.md`, "utf8"));
}

/** Replace every {{var}} with the matching value; unknown placeholders become "". */
export function fill(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_all, key: string) => vars[key] ?? "");
}

export function renderPrompt(prompt: LoadedPrompt, vars: Record<string, string | undefined>): RenderedPrompt {
  return {
    system: prompt.system === undefined ? undefined : fill(prompt.system, vars),
    user: fill(prompt.user, vars),
  };
}
