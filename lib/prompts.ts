import type { OpenRouterMessage } from "@/lib/openrouter";

export type RepoPromptContext = {
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  readme: string;
};

/** gitsearchai translate-prompt specialist rules + diversification + strict JSON output. */
const DIVERSE_QUERIES_SYSTEM = `You are a GitHub search query specialist. Your task is to produce SHORT keyword phrases people type into github.com/search.

CRITICAL PRESERVATION RULES:
1. FRAMEWORKS/LIBRARIES: NEVER remove frameworks or technical terms (d3.js, next.js, react, etc.) when they belong in a query phrase
2. PURPOSE NOUNS: NEVER drop nouns that describe what the software does (assistant, bot, scheduler, scraper, etc.)
3. BRAND NAMES FROM OUTSIDE THIS REPO: You MAY use well-known generic tech brands only when truly helpful for discovery — NEVER invent brands.
4. DOMAIN KEYWORDS: Keep AI, ML, chatbot, automation, etc. when relevant
5. MISSPELLINGS: Correct obvious typos in output
6. ABBREVIATIONS: Prefer common short forms (RAG not Retrieval-Augmented Generation)
7. NON-ENGLISH SOURCE: Translate concepts to English search terms

EXTRACTION RULES:
1. Focus on WHAT THE PROJECT DOES and WHO IT IS FOR — purpose similarity, not implementation trivia.
2. Prefer 2–5 meaningful tokens per query; shorter usually beats longer.
3. Only include programming languages when they clearly narrow discovery for THIS repo's purpose (never infer language from frameworks alone).

IMPORTANT CONSTRAINTS FOR OUTPUT:
- Do NOT use GitHub search qualifiers: no stars:, forks:, topics:, language:, code:, in:, user:, -fork:, NOT:, etc.
- Do NOT paste this repository's GitHub owner name, repo slug, or unique product/marketing name from the repo title — use generic searchable wording instead.

YOU WILL OUTPUT THREE QUERIES AT ONCE:
- q1, q2, q3 must each describe purpose similarity but from DIFFERENT angles (synonyms, adjacent problems, different audience or deployment framing — be creative).
- Across ALL THREE strings combined: no token may repeat (case-insensitive). Example: if q1 contains "assistant", neither q2 nor q3 may contain "assistant".
- Each query should tend to surface a DIFFERENT set of repositories than the others — maximize diversity.

Return ONLY valid JSON with exactly these keys — no markdown fences, no commentary:
{"q1":"","q2":"","q3":""}`;

function buildRepoContextBlock(ctx: RepoPromptContext): string {
  const topicsLine = ctx.topics.length > 0 ? ctx.topics.join(", ") : "(none)";
  return `# Repository context

**Full name (FOR CONTEXT ONLY — do not paste owner/repo slug into q1/q2/q3):** ${ctx.fullName}

**Description:** ${ctx.description ?? "(none)"}
**Primary language:** ${ctx.language ?? "unknown"}
**Topics:** ${topicsLine}

## README (truncated)
${ctx.readme || "*(No README)*"}`;
}

/** Removes owner/repo slug tokens so they don't leak into search queries. */
export function stripRepoIdentifiers(fullName: string, query: string): string {
  const segments = fullName.split("/").map((s) => s.trim()).filter(Boolean);
  const banned = new Set(segments.map((s) => s.toLowerCase()));
  const words = query.split(/\s+/).filter(Boolean).filter((w) => {
    const stripped = w.replace(/^-+/, "").toLowerCase();
    return !banned.has(stripped);
  });
  return words.join(" ").trim();
}

export function buildDiverseSearchQueriesPrompt(ctx: RepoPromptContext): OpenRouterMessage[] {
  return [
    { role: "system", content: DIVERSE_QUERIES_SYSTEM },
    {
      role: "user",
      content: `${buildRepoContextBlock(ctx)}

Generate three mutually diverse GitHub search queries as specified in the system message. Think laterally — synonyms, related capabilities, adjacent problem spaces — so each query could surface different repos.`,
    },
  ];
}

const STOP = new Set([
  "a",
  "an",
  "the",
  "with",
  "for",
  "that",
  "is",
  "built",
  "using",
  "to",
  "and",
  "or",
]);

/** gitsearchai-style validation: empty or too long → fallback. */
export function cleanGithubSearchQuery(response: string, fallbackSource: string): string {
  const trimmed = response.trim().replace(/^['"]|['"]$/g, "").split(/\s+/).join(" ");
  if (!trimmed || trimmed.length > 256) {
    return generateFallbackSearchQuery(fallbackSource);
  }
  return trimmed;
}

export function generateFallbackSearchQuery(text: string): string {
  const queryWords = text.toLowerCase().split(/\s+/);
  const keywords = queryWords.filter((w) => !STOP.has(w) && w.length > 2);
  return keywords.slice(0, 3).join(" ") || "awesome";
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return s.trim();
}

/**
 * Parses {"q1","q2","q3"} from one LLM response; cleans and strips repo identifiers.
 */
export function parseQueryTriple(
  raw: string,
  fallbackSource: string,
  repoFullName: string
): [string, string, string] {
  const fbBase = generateFallbackSearchQuery(fallbackSource);
  const words = fallbackSource
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => !STOP.has(w) && w.length > 2);

  const fallbackTriple = (): [string, string, string] =>
    [
      cleanGithubSearchQuery(stripRepoIdentifiers(repoFullName, fbBase), fallbackSource),
      cleanGithubSearchQuery(
        stripRepoIdentifiers(repoFullName, words.slice(1, 4).join(" ") || fbBase),
        fallbackSource
      ),
      cleanGithubSearchQuery(
        stripRepoIdentifiers(repoFullName, words.slice(2, 5).join(" ") || fbBase),
        fallbackSource
      ),
    ];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripJsonFences(raw)) as Record<string, unknown>;
  } catch {
    console.warn("[gitsimilar] Failed to parse query JSON; using fallback triple");
    return fallbackTriple();
  }

  const q1raw = typeof parsed.q1 === "string" ? parsed.q1 : "";
  const q2raw = typeof parsed.q2 === "string" ? parsed.q2 : "";
  const q3raw = typeof parsed.q3 === "string" ? parsed.q3 : "";

  let q1 = cleanGithubSearchQuery(stripRepoIdentifiers(repoFullName, q1raw), fallbackSource);
  let q2 = cleanGithubSearchQuery(stripRepoIdentifiers(repoFullName, q2raw), fallbackSource);
  let q3 = cleanGithubSearchQuery(stripRepoIdentifiers(repoFullName, q3raw), fallbackSource);

  if (!q1 && !q2 && !q3) return fallbackTriple();

  if (!q1) q1 = fbBase;
  if (!q2) q2 = words.slice(1, 4).join(" ") || fbBase;
  if (!q3) q3 = words.slice(2, 5).join(" ") || fbBase;

  return [
    cleanGithubSearchQuery(stripRepoIdentifiers(repoFullName, q1), fallbackSource),
    cleanGithubSearchQuery(stripRepoIdentifiers(repoFullName, q2), fallbackSource),
    cleanGithubSearchQuery(stripRepoIdentifiers(repoFullName, q3), fallbackSource),
  ];
}
