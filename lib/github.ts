import type { Repo } from "@/lib/types";

export async function ghFetch(url: string): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "gitsimilar-app",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(url, { headers });
  if (!r.ok) {
    if (r.status === 404) throw new Error("Repository not found.");
    if (r.status === 403) throw new Error("GitHub API rate limit reached. Try again in a minute.");
    throw new Error(`GitHub error (${r.status})`);
  }
  return r.json();
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
