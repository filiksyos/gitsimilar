import type { OpenRouterMessage } from "@/lib/openrouter";

/** Given every env key in the similarity file, return shared tech-stack identifiers only (JSON array). */
const SELECT_KEYS_SYSTEM =
  "You are helping find GitHub repositories that use similar third-party/API integrations.\n" +
  "You will receive a JSON array of environment variable NAMES from ONE repository's `.env.example` style file.\n\n" +
  "Task: Choose at least 3 and at most **5** names that strongly indicate SHARED services, SDKs, or vendors that OTHER repositories would ALSO use " +
  "(e.g., OPENAI_API_KEY, GITHUB_TOKEN, STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE).\n\n" +
  "EXCLUDE variables that look site-specific or internal and are unlikely to match other repos, for example:\n" +
  "- Custom product names, webhook paths, app-specific prefixes, branded names unique to one project\n" +
  "- Narrow deployment-only values with no recognizable vendor prefix\n\n" +
  "Preserve the SAME spelling and casing as in the input. Only pick names present in that list.\n" +
  "Order from MOST distinctive / stack-defining FIRST to MOST generic LAST " +
  "(so the last picks can be dropped first if GitHub returns no results).\n\n" +
  "Return ONLY valid JSON: a JSON array of strings, no markdown, no prose. Example:\n" +
  '["GITHUB_TOKEN","OPENAI_API_KEY","STRIPE_SECRET_KEY"]';

export function buildKeySelectionPrompt(allKeys: string[]): OpenRouterMessage[] {
  return [
    { role: "system", content: SELECT_KEYS_SYSTEM },
    {
      role: "user",
      content: JSON.stringify(allKeys.sort((a, b) => a.localeCompare(b))),
    },
  ];
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return s.trim();
}

/** Parse LLM JSON array; validate every entry exists in original key set (case-sensitive). */
export function parseSelectedKeys(raw: string, allKeys: string[]): string[] {
  const allowed = new Set(allKeys);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    console.warn("[gitsimilar] Failed to parse key-selection JSON");
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") continue;
    const k = item.trim();
    if (!k || !allowed.has(k)) continue;
    if (!out.includes(k)) out.push(k);
  }

  const max = 5;
  if (out.length > max) return out.slice(0, max);
  return out;
}
