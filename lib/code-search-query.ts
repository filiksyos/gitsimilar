import { reposFromCodeHits, searchCode } from "@/lib/github";
import type { Repo } from "@/lib/types";

/** Candidate env template filenames at repository root (order = preference). */
export const SIMILARITY_FILES = [
  ".env.example",
  ".env.local.example",
  ".env.template",
  ".env.sample",
];

/**
 * Build a GitHub code search query for the REST /search/code endpoint.
 * Uses `filename:` (not regex path:) — the REST API does not support the
 * regex path qualifier that only works in the GitHub web code search UI.
 * @see https://docs.github.com/en/rest/search/search#search-code
 */
export function buildCodeSearchQuery(keys: string[], filename: string): string {
  const parts = keys.map((k) => k.trim()).filter(Boolean);
  if (parts.length === 0) return "";

  return `${parts.join(" ")} filename:${filename} NOT is:fork`;
}

export type SearchCodeWithRetryResult = {
  repos: Repo[];
  total_count: number;
  queryUsed: string;
  keysUsed: string[];
  queriesTried: string[];
};

/**
 * Run code search; on zero hits, drop the last key (least important — keep LLM order) and retry.
 */
export async function searchCodeWithRetry(
  selectedKeys: string[],
  filename: string,
  options?: { maxRetries?: number; perPage?: number }
): Promise<SearchCodeWithRetryResult> {
  const maxRetries = options?.maxRetries ?? 2;
  const perPage = options?.perPage ?? 40;
  const queriesTried: string[] = [];
  let keysWorking = selectedKeys.filter((k) => k.trim());

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const q = buildCodeSearchQuery(keysWorking, filename);
    queriesTried.push(q);

    const { items, total_count } = await searchCode(q, perPage);
    if (total_count > 0) {
      return {
        repos: reposFromCodeHits(items),
        total_count,
        queryUsed: q,
        keysUsed: [...keysWorking],
        queriesTried,
      };
    }

    if (attempt === maxRetries || keysWorking.length <= 1) break;
    keysWorking = keysWorking.slice(0, -1);
  }

  const lastQ =
    queriesTried[queriesTried.length - 1] ?? buildCodeSearchQuery(keysWorking, filename);
  return {
    repos: [],
    total_count: 0,
    queryUsed: lastQ,
    keysUsed: [...keysWorking],
    queriesTried,
  };
}
