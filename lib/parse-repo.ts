const SLUG_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/** Strip trailing `.git` for path validation (URL segment may include it). */
export function normalizeRepoSegment(repo: string): string {
  return repo.trim().replace(/\.git$/i, "");
}

/** Validates dynamic route segments for `/[owner]/[repo]`. */
export function isValidGitHubRepoPath(owner: string, repo: string): boolean {
  const o = owner.trim();
  const r = normalizeRepoSegment(repo);
  if (!o || !r || o.includes("..") || r.includes("..")) return false;
  return SLUG_SEGMENT.test(o) && SLUG_SEGMENT.test(r);
}

export function parseRepoInput(raw: string): { owner: string; repo: string } {
  const trimmed = raw.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const slashMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) return { owner: slashMatch[1], repo: slashMatch[2] };
  throw new Error("Enter a GitHub repo as 'owner/name' or a full GitHub URL.");
}
