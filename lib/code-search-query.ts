import { reposFromCodeHits, searchCode } from "@/lib/github";
import { CODE_SEARCH_PER_PAGE, MAX_SIMILAR_REPOS } from "@/lib/search-limits";
import type { DepSelection } from "@/lib/prompts";
import type { Repo } from "@/lib/types";

export { DEPENDENCY_FILES } from "@/lib/dep-extractor";

/** Quote deps that need it for GitHub code search (scoped names, slashes, etc.). */
function formatDepTerm(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (/[@/.\s"'\\]/.test(trimmed)) {
    return `"${trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return trimmed;
}

/**
 * Build a GitHub code search query for the REST /search/code endpoint.
 * All terms are implicit AND — never use the OR keyword (broken qualifier scoping on REST API).
 * @see https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax
 */
export function buildCodeSearchQuery(terms: string[], filename: string): string {
  const parts = terms.map(formatDepTerm).filter(Boolean);
  if (parts.length === 0) return "";
  return `${parts.join(" ")} filename:${filename} NOT is:fork`;
}

export type SearchCodeWithRetryResult = {
  repos: Repo[];
  total_count: number;
  queryUsed: string;
  andDepsUsed: string[];
  orDepsUsed: string[];
  queriesTried: string[];
};

/**
 * Retry sequence (continue while total_count < MAX_SIMILAR_REPOS):
 * 1. AND + OR deps (all as AND terms — tightest)
 * 2. AND deps only (drop OR group)
 * 3+. Drop last AND dep each retry (LLM orders most→least important)
 */
export async function searchCodeWithRetry(
  selection: DepSelection,
  filename: string,
  options?: { maxRetries?: number; perPage?: number }
): Promise<SearchCodeWithRetryResult> {
  const maxRetries = options?.maxRetries ?? 2;
  const perPage = options?.perPage ?? CODE_SEARCH_PER_PAGE;
  const queriesTried: string[] = [];

  const andWorking = selection.and.map((d) => d.trim()).filter(Boolean);
  const orWorking = selection.or.map((d) => d.trim()).filter(Boolean);

  if (andWorking.length === 0 && orWorking.length === 0) {
    return {
      repos: [],
      total_count: 0,
      queryUsed: "",
      andDepsUsed: [],
      orDepsUsed: [],
      queriesTried,
    };
  }

  let includeOr = orWorking.length > 0;
  let andLen = andWorking.length > 0 ? andWorking.length : 1;
  const minAndLen = andWorking.length > 0 ? Math.max(1, andWorking.length - maxRetries) : 0;
  let peelsUsed = 0;

  type BestAttempt = {
    repos: Repo[];
    total_count: number;
    queryUsed: string;
    andDepsUsed: string[];
    orDepsUsed: string[];
  };
  let best: BestAttempt | null = null;

  while (true) {
    const andTerms = andWorking.length > 0 ? andWorking.slice(0, andLen) : [];
    const terms = includeOr ? [...andTerms, ...orWorking] : andTerms;

    if (terms.length === 0) break;

    const q = buildCodeSearchQuery(terms, filename);
    queriesTried.push(q);

    const { items, total_count } = await searchCode(q, perPage);
    const repos = reposFromCodeHits(items);
    const orDepsUsed = includeOr ? [...orWorking] : [];

    if (!best || total_count > best.total_count) {
      best = {
        repos,
        total_count,
        queryUsed: q,
        andDepsUsed: [...andTerms],
        orDepsUsed,
      };
    }

    if (total_count >= MAX_SIMILAR_REPOS) {
      return {
        repos,
        total_count,
        queryUsed: q,
        andDepsUsed: [...andTerms],
        orDepsUsed,
        queriesTried,
      };
    }

    if (includeOr) {
      includeOr = false;
      continue;
    }

    if (andWorking.length === 0) break;
    if (andLen <= minAndLen) break;
    if (peelsUsed >= maxRetries) break;

    andLen -= 1;
    peelsUsed += 1;
  }

  if (best && best.total_count > 0) {
    return { ...best, queriesTried };
  }

  const lastAndTerms =
    andWorking.length > 0 ? andWorking.slice(0, Math.max(minAndLen, andLen)) : [];
  const lastTerms = includeOr ? [...lastAndTerms, ...orWorking] : lastAndTerms;
  const lastQ =
    queriesTried[queriesTried.length - 1] ??
    (lastTerms.length > 0 ? buildCodeSearchQuery(lastTerms, filename) : "");

  return {
    repos: [],
    total_count: 0,
    queryUsed: lastQ,
    andDepsUsed: [...lastAndTerms],
    orDepsUsed: includeOr ? [...orWorking] : [],
    queriesTried,
  };
}
