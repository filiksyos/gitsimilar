import { LRUCache } from "lru-cache";
import { GRAPHQL_STATS_BATCH_SIZE } from "@/lib/search-limits";
import type { Repo } from "@/lib/types";

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

export function toRepo(r: Record<string, unknown>): Repo {
  const owner = r.owner as Record<string, unknown> | undefined;
  return {
    id: r.id as number,
    full_name: r.full_name as string,
    html_url: r.html_url as string,
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

/** Fetch repo metadata for each full_name; skips repos that 404 or fail. */
export async function fetchReposByFullNames(fullNames: string[]): Promise<Repo[]> {
  const results = await Promise.all(
    fullNames.map(async (fullName) => {
      const slash = fullName.indexOf("/");
      if (slash <= 0) return null;
      const owner = fullName.slice(0, slash);
      const repo = fullName.slice(slash + 1);
      try {
        const data = (await ghFetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
        )) as Record<string, unknown>;
        return toRepo(data);
      } catch (e) {
        console.warn(
          `[gitsimilar] Could not fetch repo ${fullName}:`,
          e instanceof Error ? e.message : e
        );
        return null;
      }
    })
  );

  return results.filter((repo): repo is Repo => repo !== null);
}

/** Stats merged into `Repo` after batched GraphQL lookup (see `batchFetchRepoStats`). */
export type RepoStats = {
  stargazers_count: number;
  forks_count: number;
  description: string | null;
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

type RepoStatsMiss = { cacheKey: string; owner: string; name: string };

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function fetchRepoStatsChunk(
  misses: RepoStatsMiss[],
  result: Map<string, RepoStats>
): Promise<void> {
  if (misses.length === 0) return;

  const selection = `nameWithOwner stargazerCount forkCount description`;
  const lines = misses.map(
    (m, i) =>
      `repo${i}: repository(owner: "${escapeGraphQlString(m.owner)}", name: "${escapeGraphQlString(m.name)}") { ${selection} }`
  );
  const query = `query BatchRepoStats {\n${lines.join("\n")}\n}`;

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
      stargazerCount?: number;
      forkCount?: number;
      description?: string | null;
    } | null;

    if (!node || typeof node !== "object") continue;

    const stats: RepoStats = {
      stargazers_count: typeof node.stargazerCount === "number" ? node.stargazerCount : 0,
      forks_count: typeof node.forkCount === "number" ? node.forkCount : 0,
      description:
        node.description === undefined || node.description === null
          ? null
          : typeof node.description === "string"
            ? node.description
            : null,
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

export async function batchFetchRepoStats(repos: Repo[]): Promise<Map<string, RepoStats>> {
  const result = new Map<string, RepoStats>();

  const misses: RepoStatsMiss[] = [];
  const pendingMissKeys = new Set<string>();

  for (const repo of repos) {
    const cacheKey = repo.full_name.toLowerCase();
    const cached = repoStatsCache.get(cacheKey);
    if (cached) {
      result.set(cacheKey, cached);
      continue;
    }
    const parsed = parseOwnerRepo(repo.full_name);
    if (!parsed) continue;
    if (pendingMissKeys.has(cacheKey)) continue;
    pendingMissKeys.add(cacheKey);
    misses.push({ cacheKey, owner: parsed.owner, name: parsed.name });
  }

  if (misses.length === 0) return result;

  if (!process.env.GITHUB_TOKEN?.trim()) {
    console.warn("[gitsimilar] batchFetchRepoStats: GITHUB_TOKEN missing; skipping GraphQL enrichment.");
    return result;
  }

  const chunks = chunkArray(misses, GRAPHQL_STATS_BATCH_SIZE);

  try {
    for (const chunk of chunks) {
      await fetchRepoStatsChunk(chunk, result);
    }
  } catch (e: unknown) {
    console.warn(
      `[gitsimilar] batchFetchRepoStats failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return result;
}
