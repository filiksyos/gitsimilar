const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

export type OpenRouterMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenRouterToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenRouterToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type OpenRouterToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type OpenRouterCompletionResult = {
  content: string | null;
  toolCalls: OpenRouterToolCall[];
  finishReason: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractMessageFromResponse(data: unknown): {
  content: string | null;
  toolCalls: OpenRouterToolCall[];
  finishReason: string | null;
} {
  if (!data || typeof data !== "object") {
    return { content: null, toolCalls: [], finishReason: null };
  }

  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { content: null, toolCalls: [], finishReason: null };
  }

  const first = choices[0] as {
    message?: {
      content?: unknown;
      tool_calls?: OpenRouterToolCall[];
    };
    finish_reason?: string;
  };

  let content: string | null = null;
  const rawContent = first.message?.content;
  if (typeof rawContent === "string") {
    content = rawContent.trim() || null;
  } else if (Array.isArray(rawContent)) {
    const text = rawContent
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text)
          : ""
      )
      .join("");
    content = text.trim() || null;
  }

  const toolCalls = Array.isArray(first.message?.tool_calls)
    ? first.message.tool_calls
    : [];

  return {
    content,
    toolCalls,
    finishReason: first.finish_reason ?? null,
  };
}

async function postOpenRouter(
  body: Record<string, unknown>,
  retries = 3
): Promise<unknown> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errMsg =
          typeof raw === "object" && raw !== null && "error" in raw
            ? String((raw as { error?: { message?: string } }).error?.message ?? response.statusText)
            : response.statusText;
        if (response.status === 429) {
          throw new Error("AI rate limit hit, please retry in a moment.");
        }
        if (attempt < retries) {
          console.error(`OpenRouter error (${response.status}):`, errMsg);
          await sleep(1000 * attempt);
          continue;
        }
        throw new Error(errMsg || `OpenRouter error (${response.status})`);
      }

      return raw;
    } catch (e) {
      if (e instanceof Error && e.message.includes("rate limit")) throw e;
      if (attempt < retries) {
        console.error("OpenRouter attempt failed:", e);
        await sleep(1000 * attempt);
        continue;
      }
      if (e instanceof Error) throw e;
      throw new Error(String(e));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("OpenRouter request failed after retries");
}

/**
 * Calls OpenRouter chat completions with per-request retries (empty body or network error).
 */
export async function callOpenRouter(
  messages: OpenRouterMessage[],
  retries = 3
): Promise<string> {
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const raw = await postOpenRouter({ model, messages }, retries);
  const { content } = extractMessageFromResponse(raw);
  return content ?? "";
}

/**
 * OpenRouter chat with tool definitions; returns assistant content and/or tool_calls.
 */
export async function callOpenRouterWithTools(
  messages: OpenRouterMessage[],
  tools: OpenRouterToolDefinition[],
  retries = 3
): Promise<OpenRouterCompletionResult> {
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const raw = await postOpenRouter(
    {
      model,
      messages,
      tools,
      tool_choice: "auto",
    },
    retries
  );
  const { content, toolCalls, finishReason } = extractMessageFromResponse(raw);
  return { content, toolCalls, finishReason };
}
