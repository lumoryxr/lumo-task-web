import { dbMode } from "../db/client.js";
import { assertSafeOutboundUrl } from "./ssrf.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMConfig {
  provider: "openai" | "deepseek" | "claude" | "custom";
  apiKey: string;
  baseUrl?: string | null;
  model?: string | null;
}

export interface ToolProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: ToolProperty | { type: string; description?: string; properties?: Record<string, ToolProperty>; required?: string[] };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolProperty>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type LLMResult =
  | { finish: "text"; text: string }
  | { finish: "tool_calls"; calls: ToolCall[]; assistantTurn: unknown };

const PROVIDER_DEFAULTS: Record<string, { url: string; model: string }> = {
  openai:   { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  deepseek: { url: "https://api.deepseek.com/chat/completions",  model: "deepseek-chat" },
  custom:   { url: "",                                            model: "gpt-4o-mini" },
};

function resolveUrl(config: LLMConfig): string {
  const defaults = PROVIDER_DEFAULTS[config.provider] ?? PROVIDER_DEFAULTS.openai;
  const rawBase = config.baseUrl?.trim() || null;
  return rawBase
    ? rawBase.includes("/chat/completions")
      ? rawBase
      : rawBase.replace(/\/+$/, "") + "/chat/completions"
    : defaults.url;
}

function resolveModel(config: LLMConfig): string {
  return config.model?.trim() || PROVIDER_DEFAULTS[config.provider]?.model || PROVIDER_DEFAULTS.openai.model;
}

// ── Simple text-only call (kept for backward compat) ─────────────────────────

export async function callLLM(config: LLMConfig, messages: ChatMessage[]): Promise<string> {
  const result = await callLLMWithTools(config, messages, []);
  if (result.finish === "text") return result.text;
  throw new Error("Unexpected tool_calls in text-only call");
}

// ── Tool-capable call ─────────────────────────────────────────────────────────

export async function callLLMWithTools(
  config: LLMConfig,
  messages: unknown[],
  tools: ToolDefinition[],
): Promise<LLMResult> {
  if (config.provider === "claude") {
    return callAnthropicWithTools(config, messages, tools);
  }
  return callOpenAICompatWithTools(config, messages, tools);
}

/** Append tool results to the message list in the correct provider format. */
export function appendToolResults(
  messages: unknown[],
  assistantTurn: unknown,
  calls: ToolCall[],
  results: string[],
  provider: string,
): unknown[] {
  if (provider === "claude") {
    return [
      ...messages,
      assistantTurn,
      {
        role: "user",
        content: calls.map((call, i) => ({
          type: "tool_result",
          tool_use_id: call.id,
          content: results[i],
        })),
      },
    ];
  }
  // OpenAI-compat
  return [
    ...messages,
    assistantTurn,
    ...calls.map((call, i) => ({
      role: "tool",
      tool_call_id: call.id,
      content: results[i],
    })),
  ];
}

// ── OpenAI-compatible ─────────────────────────────────────────────────────────

async function callOpenAICompatWithTools(
  config: LLMConfig,
  messages: unknown[],
  tools: ToolDefinition[],
): Promise<LLMResult> {
  const url = resolveUrl(config);
  const model = resolveModel(config);

  // SSRF guard at the outbound chokepoint: a user-supplied base URL must not
  // reach internal/metadata hosts in hosted mode (also covers env/legacy values
  // that bypassed write-time validation). Desktop mode permits localhost.
  await assertSafeOutboundUrl(url, dbMode() !== "cloud");

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: 1024,
    temperature: 0.7,
  };
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 60_000);
  console.log(`[LLM] POST ${url} model=${model}`);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    console.error(`[LLM] ${res.status} from ${url}: ${text}`);
    throw new Error(`LLM API error ${res.status} (${url}): ${text}`);
  }

  const data = await res.json() as any;
  const choice = data?.choices?.[0];
  const message = choice?.message;

  if (choice?.finish_reason === "tool_calls" && message?.tool_calls?.length) {
    const calls: ToolCall[] = message.tool_calls.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      args: (() => { try { return JSON.parse(tc.function.arguments ?? "{}"); } catch { return {}; } })(),
    }));
    return { finish: "tool_calls", calls, assistantTurn: message };
  }

  const content = message?.content;
  if (typeof content !== "string") throw new Error("Unexpected LLM response shape");
  return { finish: "text", text: content.trim() };
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function callAnthropicWithTools(
  config: LLMConfig,
  messages: unknown[],
  tools: ToolDefinition[],
): Promise<LLMResult> {
  const model = config.model?.trim() || "claude-3-5-haiku-20241022";

  const msgArr = messages as any[];
  const systemMsg = msgArr.find((m) => m.role === "system" && typeof m.content === "string");
  const convoMessages = msgArr.filter((m) => m.role !== "system" || typeof m.content !== "string");

  const body: Record<string, unknown> = {
    model,
    max_tokens: 1024,
    messages: convoMessages,
  };
  if (systemMsg) body.system = systemMsg.content;
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: abort.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any;

  if (data.stop_reason === "tool_use") {
    const toolUseBlocks = (data.content ?? []).filter((b: any) => b.type === "tool_use");
    const calls: ToolCall[] = toolUseBlocks.map((b: any) => ({
      id: b.id,
      name: b.name,
      args: b.input ?? {},
    }));
    return { finish: "tool_calls", calls, assistantTurn: { role: "assistant", content: data.content } };
  }

  const textBlock = (data.content ?? []).find((b: any) => b.type === "text");
  const text = textBlock?.text;
  if (typeof text !== "string") throw new Error("Unexpected Anthropic response shape");
  return { finish: "text", text: text.trim() };
}
