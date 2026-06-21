const DEFAULT_MODEL = "gpt-5.4-mini";

export type AzureChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AzureOpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type AzureOpenAiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AzureOpenAiToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type AzureOpenAiCompletionResult = {
  content: string | null;
  toolCalls: AzureOpenAiToolCall[];
  finishReason: string | null;
};

function readTrimmedEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

function requireAzureBaseUrl(): string {
  const baseUrl = readTrimmedEnv("AZURE_OPENAI_BASE_URL");
  if (!baseUrl) {
    throw new Error("AZURE_OPENAI_BASE_URL not configured");
  }
  return baseUrl.replace(/\/+$/, "");
}

function requireAzureApiKey(): string {
  const apiKey = readTrimmedEnv("AZURE_OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("AZURE_OPENAI_API_KEY not configured");
  }
  return apiKey;
}

function getAzureModel(): string {
  return readTrimmedEnv("AZURE_OPENAI_MODEL") ?? DEFAULT_MODEL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const err = (data as { error?: unknown }).error;
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }

  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return null;
}

function extractMessageFromResponse(data: unknown): {
  content: string | null;
  toolCalls: AzureOpenAiToolCall[];
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
      tool_calls?: AzureOpenAiToolCall[];
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

async function postAzureChatCompletions(
  body: Record<string, unknown>,
  retries = 3
): Promise<unknown> {
  const url = `${requireAzureBaseUrl()}/chat/completions`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireAzureApiKey()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const raw = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errMsg =
          extractErrorMessage(raw) || `Azure OpenAI error (${response.status})`;

        if (response.status === 429) {
          throw new Error("AI rate limit hit, please retry in a moment.");
        }

        if (attempt < retries) {
          console.error(`Azure OpenAI error (${response.status}):`, errMsg);
          await sleep(1000 * attempt);
          continue;
        }

        throw new Error(errMsg);
      }

      return raw;
    } catch (error) {
      if (error instanceof Error && error.message.includes("rate limit")) {
        throw error;
      }

      if (attempt < retries) {
        console.error("Azure OpenAI attempt failed:", error);
        await sleep(1000 * attempt);
        continue;
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(String(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Azure OpenAI request failed after retries");
}

export async function callAzureChatCompletions(
  messages: AzureChatMessage[],
  retries = 3
): Promise<string> {
  const raw = await postAzureChatCompletions(
    {
      model: getAzureModel(),
      messages,
    },
    retries
  );
  const { content } = extractMessageFromResponse(raw);
  return content ?? "";
}

export async function callAzureChatCompletionsWithTools(
  messages: AzureChatMessage[],
  tools: AzureOpenAiToolDefinition[],
  retries = 3
): Promise<AzureOpenAiCompletionResult> {
  const raw = await postAzureChatCompletions(
    {
      model: getAzureModel(),
      messages,
      tools,
      tool_choice: "auto",
    },
    retries
  );
  const { content, toolCalls, finishReason } = extractMessageFromResponse(raw);
  return { content, toolCalls, finishReason };
}
