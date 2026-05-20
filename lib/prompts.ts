import type { OpenRouterMessage } from "@/lib/openrouter";

export type RepoQueryContext = {
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
};

const MAX_README_CHARS = 2048;

export function truncateReadme(readme: string): string {
  const trimmed = readme.trim();
  if (trimmed.length <= MAX_README_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_README_CHARS)}\n\n[README truncated]`;
}

export function buildAgentSystemPrompt(
  repo: RepoQueryContext,
  readmeTruncated: string
): string {
  return (
    `You are finding GitHub repositories that are direct alternatives to ${repo.full_name}.\n\n` +
    `SIMILARITY MEANS: another repo a developer would use instead of this one — same problem solved, same type of user. ` +
    `Language and tech stack are secondary. Popularity (stars) matters when choosing between equally similar repos.\n\n` +
    `REPO CONTEXT:\n` +
    `  Description: ${repo.description ?? "(none)"}\n` +
    `  Language: ${repo.language ?? "(unknown)"}\n` +
    `  README (truncated):\n${readmeTruncated || "(no README content)"}\n\n` +
    `TOOLS:\n` +
    `  github_search(query, limit?) — search GitHub repositories directly. Returns full_name, description, stars, language. ` +
    `Supports GitHub qualifiers (e.g. language:typescript, stars:>500).\n` +
    `  web_search(query, limit?) — search the web. Returns title, url, description. Use to find curated lists and comparison articles.\n` +
    `  scrape_page(url) — full markdown of a page. Use on curated list posts (comparison articles, "top N" roundups, awesome-style lists on GitHub) ` +
    `that likely contain many repo links. Avoid scraping individual project homepages, docs, or Reddit.\n\n` +
    `SEARCH RULES:\n` +
    `1. Do NOT search for "${repo.full_name}" or words from its name — you already have it.\n` +
    `2. Search for the PURPOSE: what problem this tool solves, what the user does with it, what niche it belongs to.\n` +
    `3. Use github_search when you want structured repo results sorted by popularity.\n` +
    `4. Use web_search to discover curated list pages, then scrape_page on the best list URLs.\n` +
    `5. Gather as many genuinely similar repos as you can before finishing.\n` +
    `6. Max 8 tool calls total. Be decisive.\n\n` +
    `FINAL OUTPUT (when done, no more tool calls):\n` +
    `Return ONLY valid JSON with no markdown fences:\n` +
    `{"similar":["owner/repo","owner/repo",...]}\n` +
    `List every repo you found that is a direct alternative, ordered most-similar first. ` +
    `No cap on list length. ` +
    `Do NOT include awesome-lists, tutorials, security guides, starter kits, or meta-collections unless nothing more directly similar exists. ` +
    `No prose.`
  );
}

export function buildAgentInitialMessages(
  repo: RepoQueryContext,
  readmeTruncated: string
): OpenRouterMessage[] {
  return [
    { role: "system", content: buildAgentSystemPrompt(repo, readmeTruncated) },
    {
      role: "user",
      content:
        `Find repositories similar to ${repo.full_name}. ` +
        `Read the README to understand what it does, then use github_search, web_search, and scrape_page as needed. ` +
        `When finished, return the ranked similar JSON.`,
    },
  ];
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return s.trim();
}

/** Parse agent final output: {"similar":["owner/repo",...]} */
export function parseSimilarJson(raw: string): string[] {
  const cleaned = stripJsonFences(raw);
  try {
    const parsed = JSON.parse(cleaned) as { similar?: unknown; candidates?: unknown };
    const list = parsed.similar ?? parsed.candidates;
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const item of list) {
      if (typeof item !== "string") continue;
      const name = item.trim();
      if (!name.includes("/")) continue;
      const key = name.toLowerCase();
      if (!out.some((x) => x.toLowerCase() === key)) out.push(name);
    }
    return out;
  } catch {
    return [];
  }
}
