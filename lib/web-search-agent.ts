import Firecrawl from "@mendable/firecrawl-js";
import { batchFetchRepoStats, fetchReposByFullNames, ghFetch, toRepo } from "@/lib/github";
import { callOpenRouter } from "@/lib/openrouter";
import { parseRepoInput } from "@/lib/parse-repo";
import {
  buildQueryGenPrompt,
  fallbackQueries,
  parseQueryList,
  type RepoQueryContext,
} from "@/lib/prompts";
import { MAX_SIMILAR_REPOS } from "@/lib/search-limits";
import type { Repo, SearchEvent } from "@/lib/types";

const FIRECRAWL_SEARCH_LIMIT = 8;
const MAX_CANDIDATE_REPOS = 30;

const GITHUB_REPO_URL_RE =
  /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/gi;

let firecrawlClient: Firecrawl | null = null;

function getFirecrawlClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY not configured");
  }
  if (!firecrawlClient) {
    firecrawlClient = new Firecrawl({ apiKey });
  }
  return firecrawlClient;
}

function extractGithubFullNames(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(GITHUB_REPO_URL_RE)) {
    const owner = match[1];
    const repo = match[2];
    if (!owner || !repo) continue;

    const cleanedRepo = repo.replace(/\.git$/i, "").split(/[?#]/)[0];
    const reserved = new Set([
      "topics",
      "issues",
      "pulls",
      "discussions",
      "settings",
      "actions",
      "projects",
      "wiki",
      "security",
      "releases",
      "tags",
      "stargazers",
      "network",
      "graphs",
      "compare",
      "search",
    ]);
    if (reserved.has(cleanedRepo.toLowerCase())) continue;

    const fullName = `${owner}/${cleanedRepo}`;
    const key = fullName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fullName);
  }

  return out;
}

function collectUrlsFromSearchResults(data: {
  web?: Array<{ url?: string; description?: string; markdown?: string }>;
}): string[] {
  const chunks: string[] = [];
  for (const item of data.web ?? []) {
    if (item.url) chunks.push(item.url);
    if (item.description) chunks.push(item.description);
    if (item.markdown) chunks.push(item.markdown);
  }
  return chunks;
}

async function runFirecrawlSearch(
  query: string,
  mode: "github" | "web"
): Promise<string[]> {
  const client = getFirecrawlClient();
  const options =
    mode === "github"
      ? { categories: ["github" as const], limit: FIRECRAWL_SEARCH_LIMIT }
      : { limit: FIRECRAWL_SEARCH_LIMIT };

  const data = await client.search(query, options);
  const text = collectUrlsFromSearchResults(data).join("\n");
  return extractGithubFullNames(text);
}

function finalizeSimilarRepos(candidates: Repo[], sourceFullName: string): Repo[] {
  const lower = sourceFullName.toLowerCase();
  const filtered = candidates.filter((r) => r.full_name.toLowerCase() !== lower);
  filtered.sort((a, b) => {
    const star = b.stargazers_count - a.stargazers_count;
    if (star !== 0) return star;
    return a.full_name.localeCompare(b.full_name);
  });
  return filtered.slice(0, MAX_SIMILAR_REPOS);
}

async function generateQueries(repo: RepoQueryContext): Promise<string[]> {
  try {
    const raw = await callOpenRouter(buildQueryGenPrompt(repo));
    const queries = parseQueryList(raw);
    if (queries.length > 0) return queries;
  } catch (e) {
    console.warn(
      "[gitsimilar] Query generation failed, using fallback:",
      e instanceof Error ? e.message : e
    );
  }
  return fallbackQueries(repo);
}

export async function runWebSearchAgent(
  input: string,
  onEvent: (event: SearchEvent) => void
): Promise<{ source: Repo; similar: Repo[]; reasoning: string }> {
  const { owner, repo: repoName } = parseRepoInput(input);

  onEvent({ type: "status", message: "Fetching repo info..." });

  const repoData = (await ghFetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`
  )) as Record<string, unknown>;
  const source = toRepo(repoData);

  const repoContext: RepoQueryContext = {
    full_name: source.full_name,
    name: repoName,
    description: source.description,
    language: source.language,
  };

  onEvent({ type: "status", message: "Generating search queries..." });
  const queries = await generateQueries(repoContext);
  if (queries.length === 0) {
    throw new Error("Could not generate search queries for this repository.");
  }

  onEvent({ type: "status", message: "Searching the web..." });

  const webQueries = queries.slice(0, 3);
  const searchTasks: Array<{ query: string; mode: "github" | "web"; index: number }> = [];
  let index = 0;

  for (const query of queries) {
    searchTasks.push({ query, mode: "github", index: index++ });
  }
  for (const query of webQueries) {
    searchTasks.push({ query, mode: "web", index: index++ });
  }

  const foundNames = new Set<string>();
  await Promise.all(
    searchTasks.map(async ({ query, mode, index: taskIndex }) => {
      onEvent({ type: "search", query, mode, index: taskIndex });
      try {
        const names = await runFirecrawlSearch(query, mode);
        for (const name of names) {
          foundNames.add(name);
        }
      } catch (e) {
        console.warn(
          `[gitsimilar] Firecrawl search failed (${mode}): ${query}`,
          e instanceof Error ? e.message : e
        );
      }
    })
  );

  const candidateNames = [...foundNames]
    .filter((name) => name.toLowerCase() !== source.full_name.toLowerCase())
    .slice(0, MAX_CANDIDATE_REPOS);

  if (candidateNames.length === 0) {
    throw new Error(
      "No similar repositories found via web search. Try another repository or retry in a moment."
    );
  }

  onEvent({ type: "status", message: "Enriching results..." });

  let candidates = await fetchReposByFullNames(candidateNames);
  const statsMap = await batchFetchRepoStats(candidates);
  candidates = candidates.map((r) => {
    const stats = statsMap.get(r.full_name.toLowerCase());
    return stats ? { ...r, ...stats } : r;
  });

  const similar = finalizeSimilarRepos(candidates, source.full_name);
  if (similar.length === 0) {
    throw new Error("No similar repositories found after filtering results.");
  }

  const reasoning = [
    `${queries.length} generated queries`,
    `${searchTasks.length} Firecrawl searches`,
    `${candidateNames.length} candidate repos`,
    `${similar.length} similar repos shown`,
  ].join(" · ");

  return { source, similar, reasoning };
}
