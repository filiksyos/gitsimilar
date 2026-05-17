import type { Repo } from "@/lib/types";

/** README body max characters passed into LLM prompts (truncation). */
export const README_MAX_CHARS = 3000;

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "gitsimilar-app",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

export async function ghFetch(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: githubHeaders() });
  if (!r.ok) {
    if (r.status === 404) throw new Error("Repository not found.");
    if (r.status === 403) throw new Error("GitHub API rate limit reached. Try again in a minute.");
    throw new Error(`GitHub error (${r.status})`);
  }
  return r.json();
}

const GITHUB_SEARCH_URL = "https://api.github.com/search/repositories";

/**
 * GitHub repository search (`/search/repositories`), sorted by stars.
 */
export async function searchRepositories(
  query: string,
  perPage = 15
): Promise<{ items: Repo[]; total_count: number }> {
  const trimmed = query.trim();
  if (!trimmed) return { items: [], total_count: 0 };

  const url = new URL(GITHUB_SEARCH_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");

  const r = await fetch(url.toString(), {
    headers: githubHeaders(),
    signal: AbortSignal.timeout(30_000),
  });

  if (!r.ok) {
    if (r.status === 403) {
      throw new Error("GitHub API rate limit reached. Try again in a minute.");
    }
    console.warn(`[gitsimilar] GitHub search HTTP ${r.status} for query: ${trimmed.slice(0, 120)}`);
    return { items: [], total_count: 0 };
  }

  const data = (await r.json()) as {
    items?: Record<string, unknown>[];
    total_count?: number;
  };
  const items = (data.items ?? []).map((row) => toRepo(row));

  return { items, total_count: data.total_count ?? 0 };
}

type ReadmeContentsResponse = { content?: string; encoding?: string };

/** Raw README from GitHub API (base64). Returns empty string if missing or on 404. */
export async function getReadme(
  owner: string,
  repo: string,
  branch: string = "main"
): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}/readme?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: githubHeaders() });

  if (res.status === 404) return "";

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("GitHub API rate limit reached. Try again in a minute.");
    }
    throw new Error(`GitHub error (${res.status})`);
  }

  const data = (await res.json()) as ReadmeContentsResponse;
  if (data.encoding !== "base64" || typeof data.content !== "string") return "";

  try {
    return Buffer.from(data.content.replace(/\s/g, ""), "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/** Truncate README for prompt injection. */
export function truncateReadme(readme: string): string {
  if (!readme) return "";
  if (readme.length <= README_MAX_CHARS) return readme;
  return `${readme.slice(0, README_MAX_CHARS)}\n\n… (README truncated)`;
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
