import type { OpenRouterMessage } from "@/lib/openrouter";

export type RepoQueryContext = {
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
};

const QUERY_GEN_SYSTEM =
  "You help find GitHub repositories similar to a given open-source project.\n" +
  "You will receive JSON with the repo's full_name, name, description, and primary language.\n\n" +
  "Return 3 to 4 diverse web search queries that would surface similar or related GitHub repos.\n" +
  "Mix query styles:\n" +
  "- direct repo lookup (e.g. \"openclaw/openclaw github\")\n" +
  "- similarity phrasing (e.g. \"similar repositories to openclaw/openclaw\")\n" +
  "- concept / niche terms from the description\n" +
  "- alternatives / forks / inspired-by phrasing\n\n" +
  "Rules:\n" +
  "- Do NOT repeat the exact same query twice.\n" +
  "- Prefer queries that would surface github.com URLs.\n" +
  "- Keep each query under 120 characters.\n" +
  "- Return ONLY valid JSON: {\"queries\":[\"...\",\"...\"]}\n" +
  "- No markdown, no prose.";

export function buildQueryGenPrompt(repo: RepoQueryContext): OpenRouterMessage[] {
  return [
    { role: "system", content: QUERY_GEN_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        full_name: repo.full_name,
        name: repo.name,
        description: repo.description,
        language: repo.language,
      }),
    },
  ];
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return s.trim();
}

/** Parse LLM JSON object into a deduped list of search queries. */
export function parseQueryList(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    console.warn("[gitsimilar] Failed to parse query-gen JSON");
    return [];
  }

  if (!parsed || typeof parsed !== "object") return [];

  const queries = (parsed as { queries?: unknown }).queries;
  if (!Array.isArray(queries)) return [];

  const out: string[] = [];
  for (const item of queries) {
    if (typeof item !== "string") continue;
    const q = item.trim();
    if (!q || out.includes(q)) continue;
    out.push(q);
    if (out.length >= 4) break;
  }
  return out;
}

/** Deterministic fallback when OpenRouter is unavailable or returns nothing. */
export function fallbackQueries(repo: RepoQueryContext): string[] {
  const out: string[] = [];
  const push = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || out.includes(trimmed)) return;
    out.push(trimmed);
  };

  push(`${repo.full_name} github`);
  push(`similar repositories to ${repo.full_name}`);
  push(`${repo.name} alternatives github`);
  if (repo.description) {
    push(`${repo.description.slice(0, 80)} github open source`);
  }
  if (repo.language) {
    push(`${repo.name} ${repo.language} similar github`);
  }

  return out.slice(0, 4);
}
