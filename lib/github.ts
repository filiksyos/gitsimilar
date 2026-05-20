import { LRUCache } from "lru-cache";
import { GITHUB_SEARCH_MAX, GRAPHQL_STATS_BATCH_SIZE } from "@/lib/search-limits";
import type { Repo } from "@/lib/types";

const README_MAX_BYTES = 2048;

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "gitsimilar-app",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function ghJson(url: string, options?: RequestInit): Promise<{ ok: boolean; status: number; data: unknown }> {
  const r = await fetch(url, {
    ...options,
    headers: { ...githubHeaders(), ...options?.headers },
    signal: options?.signal ?? AbortSignal.timeout(30_000),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export async function ghFetch(url: string): Promise<unknown> {
  const { ok, status, data } = await ghJson(url);
  if (!ok) {
    if (status === 404) throw new Error("Repository not found.");
    if (status === 403) throw new Error("GitHub API rate limit reached. Try again in a minute.");
    throw new Error(`GitHub error (${status})`);
  }
  return data;
}

export type GitHubSearchHit = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
};

/** Search GitHub repositories via REST search API (sorted by stars). */
export async function searchRepositories(
  query: string,
  limit = 10
): Promise<GitHubSearchHit[]> {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", String(Math.min(Math.max(limit, 1), GITHUB_SEARCH_MAX)));
  url.searchParams.set("sort", "stars");

  const { ok, status, data } = await ghJson(url.toString());
  if (!ok) {
    if (status === 403) throw new Error("GitHub search rate limit reached.");
    throw new Error(`GitHub search error (${status})`);
  }

  const items = (data as { items?: unknown[] }).items ?? [];
  const out: GitHubSearchHit[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const fullName = r.full_name;
    if (typeof fullName !== "string" || !fullName.includes("/")) continue;
    out.push({
      full_name: fullName,
      description:
        r.description === null || r.description === undefined
          ? null
          : typeof r.description === "string"
            ? r.description
            : null,
      stargazers_count:
        typeof r.stargazers_count === "number" ? r.stargazers_count : 0,
      language:
        r.language === null || r.language === undefined
          ? null
          : typeof r.language === "string"
            ? r.language
            : null,
    });
  }

  return out;
}

export function toRepo(r: Record<string, unknown>): Repo {
  const owner = r.owner as Record<string, unknown> | undefined;
  return {
    id: (r.id as number | undefined) ?? 0,
    full_name: r.full_name as string,
    html_url: (r.html_url as string | undefined) ?? `https://github.com/${r.full_name}`,
    description: (r.description as string | null) ?? null,
    stargazers_count: (r.stargazers_count as number | undefined) ?? 0,
    forks_count: (r.forks_count as number | undefined) ?? 0,
    language: (r.language as string | null | undefined) ?? null,
    topics: Array.isArray(r.topics) ? (r.topics as string[]) : [],
    owner: {
      login: (owner?.login as string | undefined) ?? "",
      avatar_url: (owner?.avatar_url as string | undefined) ?? "",
    },
  };
}

/** Fetch README content via GitHub API; returns empty string on failure. */
export async function fetchRepoReadme(owner: string, repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`;

  try {
    const rawRes = await fetch(url, {
      headers: {
        ...githubHeaders(),
        Accept: "application/vnd.github.raw",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (rawRes.ok) {
      const text = await rawRes.text();
      return text.slice(0, README_MAX_BYTES);
    }

    const { ok, data } = await ghJson(url);
    if (!ok) return "";

    const json = data as { content?: string; encoding?: string };
    if (json.content && json.encoding === "base64") {
      const decoded = Buffer.from(json.content, "base64").toString("utf-8");
      return decoded.slice(0, README_MAX_BYTES);
    }

    return "";
  } catch (e) {
    console.warn(
      `[gitsimilar] README fetch failed for ${owner}/${repo}:`,
      e instanceof Error ? e.message : e
    );
    return "";
  }
}

/** Stats merged into `Repo` after batched GraphQL lookup. */
export type RepoStats = {
  stargazers_count: number;
  forks_count: number;
  description: string | null;
  language: string | null;
  html_url: string | null;
  ownerLogin: string | null;
  ownerAvatarUrl: string | null;
  topics: string[];
};

const repoStatsCache = new LRUCache<string, RepoStats>({
  max: 1000,
  ttl: 10 * 60 * 1000,
});

function escapeGraphQlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseOwnerRepo(fullName: string): { owner: string; name: string } | null {
  const i = fullName.indexOf("/");
  if (i <= 0 || i >= fullName.length - 1) return null;
  return { owner: fullName.slice(0, i), name: fullName.slice(i + 1) };
}

function graphqlPostHeaders(): Record<string, string> {
  return {
    ...githubHeaders(),
    "Content-Type": "application/json",
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

type RepoBatchMiss = { cacheKey: string; owner: string; name: string };

async function fetchRepoBatchChunk(
  misses: RepoBatchMiss[],
  result: Map<string, RepoStats>
): Promise<void> {
  if (misses.length === 0) return;

  const selection = `
    nameWithOwner
    url
    stargazerCount
    forkCount
    description
    primaryLanguage { name }
    repositoryTopics(first: 10) { nodes { topic { name } } }
    owner { login avatarUrl }
  `;

  const lines = misses.map(
    (m, i) =>
      `repo${i}: repository(owner: "${escapeGraphQlString(m.owner)}", name: "${escapeGraphQlString(m.name)}") { ${selection} }`
  );
  const query = `query BatchRepos {\n${lines.join("\n")}\n}`;

  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: graphqlPostHeaders(),
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });

  const raw = (await r.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
    errors?: unknown[];
  };

  if (!r.ok) {
    console.warn(
      `[gitsimilar] GraphQL HTTP ${r.status}: ${JSON.stringify(raw).slice(0, 800)}`
    );
    return;
  }

  if (Array.isArray(raw.errors) && raw.errors.length > 0) {
    console.warn(`[gitsimilar] GraphQL errors: ${JSON.stringify(raw.errors).slice(0, 1200)}`);
  }

  const data = raw.data;
  if (!data || typeof data !== "object") return;

  for (let i = 0; i < misses.length; i++) {
    const alias = `repo${i}`;
    const node = data[alias] as {
      nameWithOwner?: string;
      url?: string;
      stargazerCount?: number;
      forkCount?: number;
      description?: string | null;
      primaryLanguage?: { name?: string } | null;
      repositoryTopics?: { nodes?: Array<{ topic?: { name?: string } }> };
      owner?: { login?: string; avatarUrl?: string };
    } | null;

    if (!node || typeof node !== "object") continue;

    const topics =
      node.repositoryTopics?.nodes
        ?.map((n) => n.topic?.name)
        .filter((t): t is string => typeof t === "string") ?? [];

    const stats: RepoStats = {
      stargazers_count: typeof node.stargazerCount === "number" ? node.stargazerCount : 0,
      forks_count: typeof node.forkCount === "number" ? node.forkCount : 0,
      description:
        node.description === undefined || node.description === null
          ? null
          : typeof node.description === "string"
            ? node.description
            : null,
      language: node.primaryLanguage?.name ?? null,
      html_url: typeof node.url === "string" ? node.url : null,
      ownerLogin: node.owner?.login ?? null,
      ownerAvatarUrl: node.owner?.avatarUrl ?? null,
      topics,
    };

    const apiKey =
      typeof node.nameWithOwner === "string" && node.nameWithOwner.length > 0
        ? node.nameWithOwner.toLowerCase()
        : misses[i].cacheKey;

    repoStatsCache.set(apiKey, stats);
    result.set(apiKey, stats);
    if (apiKey !== misses[i].cacheKey) {
      repoStatsCache.set(misses[i].cacheKey, stats);
      result.set(misses[i].cacheKey, stats);
    }
  }
}

async function batchFetchRepoDataMap(
  fullNames: string[]
): Promise<Map<string, RepoStats>> {
  const result = new Map<string, RepoStats>();
  const misses: RepoBatchMiss[] = [];
  const pendingMissKeys = new Set<string>();

  for (const fullName of fullNames) {
    const cacheKey = fullName.toLowerCase();
    const cached = repoStatsCache.get(cacheKey);
    if (cached) {
      result.set(cacheKey, cached);
      continue;
    }
    const parsed = parseOwnerRepo(fullName);
    if (!parsed) continue;
    if (pendingMissKeys.has(cacheKey)) continue;
    pendingMissKeys.add(cacheKey);
    misses.push({ cacheKey, owner: parsed.owner, name: parsed.name });
  }

  if (misses.length === 0) return result;

  if (!process.env.GITHUB_TOKEN?.trim()) {
    console.warn("[gitsimilar] GITHUB_TOKEN missing; GraphQL batch skipped.");
    return result;
  }

  const chunks = chunkArray(misses, GRAPHQL_STATS_BATCH_SIZE);
  try {
    for (const chunk of chunks) {
      await fetchRepoBatchChunk(chunk, result);
    }
  } catch (e: unknown) {
    console.warn(
      `[gitsimilar] batchFetchRepoDataMap failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return result;
}

function statsToRepo(fullName: string, stats: RepoStats, index: number): Repo {
  const [owner, repo] = fullName.split("/");
  return {
    id: index,
    full_name: fullName,
    html_url: stats.html_url ?? `https://github.com/${fullName}`,
    description: stats.description,
    stargazers_count: stats.stargazers_count,
    forks_count: stats.forks_count,
    language: stats.language,
    topics: stats.topics,
    owner: {
      login: stats.ownerLogin ?? owner,
      avatar_url: stats.ownerAvatarUrl ?? "",
    },
  };
}

/**
 * Fetch repo metadata for each full_name via a single GraphQL batch per chunk.
 * Skips repos that 404 or are missing from GraphQL response.
 */
export async function batchFetchReposByNames(fullNames: string[]): Promise<Repo[]> {
  const statsMap = await batchFetchRepoDataMap(fullNames);
  const repos: Repo[] = [];
  let index = 0;

  for (const fullName of fullNames) {
    const stats = statsMap.get(fullName.toLowerCase());
    if (!stats) continue;
    repos.push(statsToRepo(fullName, stats, index++));
  }

  return repos;
}

/** @deprecated Use batchFetchReposByNames — kept for any external imports */
export async function batchFetchRepoStats(repos: Repo[]): Promise<Map<string, RepoStats>> {
  return batchFetchRepoDataMap(repos.map((r) => r.full_name));
}
