import OpenAI from "openai";
import type { Repo } from "@/lib/types";

const DEFAULT_MODEL = "gpt-4.1-mini";

function extractFirstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const lineBreak = trimmed.indexOf("\n\n");
  const head = lineBreak === -1 ? trimmed : trimmed.slice(0, lineBreak).trim();

  const sentenceMatch = head.match(/^(.+?[.!?])(?:\s|$)/);
  if (sentenceMatch) return sentenceMatch[1].trim();

  const firstLine = head.split("\n")[0]?.trim();
  return firstLine ?? trimmed.slice(0, 280);
}

/** Matches github.com/owner/repo (owner/repo allow GitHub username/repo naming chars). */
const REPO_URL_RE = /github\.com\/([\w.-]+)\/([\w.-]+)/gi;

export function extractGithubRepoFullNamesFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const m of text.matchAll(REPO_URL_RE)) {
    const owner = m[1];
    const repo = m[2];
    if (!owner || !repo) continue;
    const lower = `${owner}/${repo}`.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(`${owner}/${repo}`);
  }

  return out;
}

export type WebDiscoverResult = {
  reasoning: string;
  fullNames: string[];
};

export async function discoverSimilarReposWithWebSearch(source: Repo): Promise<WebDiscoverResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const model = process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const client = new OpenAI({ apiKey });

  const input = `First write one sentence describing what github.com/${source.full_name} does.

Then search the web (especially github.com) for open source repositories that are genuinely similar in purpose and technical stack.

List 8-12 repositories. Output each on its own line in this exact format:
github.com/owner/repo

Repository context:
Description: ${source.description ?? "(none)"}
Language: ${source.language ?? "unknown"}
Topics: ${source.topics.join(", ") || "(none)"}`;

  let response;
  try {
    response = await client.responses.create({
      model,
      tools: [{ type: "web_search", search_context_size: "medium" }],
      tool_choice: "required",
      input,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429/.test(msg)) throw new Error("AI rate limit hit, please retry in a moment.");
    throw err;
  }

  const rawText = response.output_text?.trim() ?? "";
  if (!rawText) throw new Error("AI returned empty response");

  const reasoning = extractFirstSentence(rawText);
  const fullNames = extractGithubRepoFullNamesFromText(rawText);

  if (fullNames.length === 0) {
    throw new Error(
      "Could not extract GitHub repository URLs from the AI response. Try another repository."
    );
  }

  return { reasoning, fullNames };
}
