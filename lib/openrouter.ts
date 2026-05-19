const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

const DEFAULT_MODEL = "openai/gpt-4o-mini";

export type OpenRouterMessage = { role: "system" | "user" | "assistant"; content: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractChatCompletionContent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text: unknown }).text)
          : ""
      )
      .join("");
    return text.trim() || null;
  }
  return null;
}

/**
 * Calls OpenRouter chat completions with per-request retries (empty body or network error).
 */
export async function callOpenRouter(
  messages: OpenRouterMessage[],
  retries = 3
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages }),
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

      const text = extractChatCompletionContent(raw) ?? "";
      if (text) return text;
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

  return "";
}
