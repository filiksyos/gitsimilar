import fs from "fs";
import path from "path";
import type { AzureChatMessage } from "@/lib/azure-openai";

export type RepoQueryContext = {
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
};

const MAX_README_CHARS = 2048;

export function truncateReadme(readme: string): string {
  const trimmed = readme.trim();
  if (trimmed.length <= MAX_README_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_README_CHARS)}\n\n[README truncated]`;
}

let _systemPromptTemplate: string | null = null;

function loadSystemPromptTemplate(): string {
  if (!_systemPromptTemplate) {
    const filePath = path.join(process.cwd(), "lib", "prompts", "system.md");
    _systemPromptTemplate = fs.readFileSync(filePath, "utf-8");
  }
  return _systemPromptTemplate;
}

export function buildAgentSystemPrompt(
  repo: RepoQueryContext,
  readmeTruncated: string
): string {
  return loadSystemPromptTemplate()
    .replace(/\{\{FULL_NAME\}\}/g, repo.full_name)
    .replace(/\{\{DESCRIPTION\}\}/g, repo.description ?? "(none)")
    .replace(/\{\{LANGUAGE\}\}/g, repo.language ?? "(unknown)")
    .replace(/\{\{STARS\}\}/g, repo.stars.toLocaleString())
    .replace(/\{\{README\}\}/g, readmeTruncated || "(no README content)");
}

export function buildAgentInitialMessages(
  repo: RepoQueryContext,
  readmeTruncated: string
): AzureChatMessage[] {
  return [
    { role: "system", content: buildAgentSystemPrompt(repo, readmeTruncated) },
    {
      role: "user",
      content:
        `Find repositories similar to ${repo.full_name}. Use the available tools to discover direct alternatives, then return the ranked JSON.`,
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
