import { searchRepositories } from "@/lib/github";
import type { Repo } from "@/lib/types";
import { callOpenRouter, type OpenRouterMessage } from "@/lib/openrouter";

/** Ported from gitsearchai `createRareWordPrompt`. */
function createRareWordPrompt(query: string): OpenRouterMessage[] {
  return [
    {
      role: "system",
      content:
        "You are a GitHub search specialist. When a search query returns zero or very few results, " +
        "identify which SINGLE WORD is most likely causing the low result count.\n\n" +
        "ABSOLUTELY PROTECTED WORDS (NEVER REMOVE):\n" +
        "1. FRAMEWORKS/LIBRARIES/TOOLS: Never remove any technical frameworks, libraries, or tools (react, vue, n8n, docker, kubernetes, tensorflow, etc.)\n" +
        "2. PROGRAMMING LANGUAGES: Never remove language names (python, javascript, rust, go, etc.)\n" +
        "3. PLATFORMS/SERVICES: Never remove specific platforms or services (github, aws, vercel, netlify, etc.)\n" +
        "4. PURPOSE/DOMAIN NOUNS: Never remove core functionality words (api, dashboard, calculator, tracker, etc.)\n" +
        "5. BRAND/PRODUCT NAMES: Never remove proper nouns and brand names (twitter, gmail, slack, etc.)\n" +
        "6. DOMAIN-SPECIFIC TECHNICAL TERMS: Never remove domain keywords (AI, ML, machine learning, blockchain, neural, deep learning, etc.)\n\n" +
        "PRIORITY FOR REMOVAL (most to least likely to remove):\n" +
        "1. GENERIC DESCRIPTORS: Generic words that don't add specificity (app, application, tool, system, software, program)\n" +
        "2. REDUNDANT ADJECTIVES: Overly descriptive adjectives (awesome, amazing, simple, easy, quick)\n" +
        "3. IMPLEMENTATION DETAILS: Vague implementation words (built, using, with, made, developed)\n" +
        "4. COMPOUND WORD PARTS: Parts of compound words that might be split differently (floorplan → plan)\n" +
        "5. CONTEXT MISMATCHES: Words that seem out of place with the technical context\n\n" +
        "RULES:\n" +
        "- Return ONLY the single word (no explanations, quotes, or punctuation)\n" +
        "- Word must exist exactly in the original query\n" +
        "- Always prioritize removing generic words over specific technical terms\n" +
        "- When in doubt, remove the most generic/descriptive word\n" +
        "- If no clear word to remove, return empty response",
    },
    {
      role: "user",
      content: `This query returned zero or very few results. Which word is most likely causing the low result count: ${query}`,
    },
  ];
}

function removeWordFromQuery(query: string, wordToRemove: string): string {
  const words = query.split(/\s+/);
  const filtered = words.filter((w) => w.toLowerCase() !== wordToRemove.toLowerCase());
  return filtered.join(" ").trim();
}

async function identifyRareWord(query: string): Promise<string> {
  const messages = createRareWordPrompt(query);
  try {
    const rareWord = await callOpenRouter(messages, 2);
    const queryWords = query.toLowerCase().split(/\s+/);
    if (rareWord && queryWords.includes(rareWord.toLowerCase())) {
      return rareWord.trim();
    }
    if (rareWord) console.warn(`[gitsimilar] LLM rare-word '${rareWord}' not in query '${query}'`);
    return "";
  } catch (e) {
    console.error("[gitsimilar] identifyRareWord error:", e);
    return "";
  }
}

export type SearchWithRetryResult = {
  items: Repo[];
  total_count: number;
  /** Queries attempted in order (initial LLM query, then optional rare-word trims). */
  queriesTried: string[];
};

/**
 * When GitHub Search returns zero results, ask the LLM which word to drop (gitsearchai-style), up to `maxRareWordRetries` times.
 */
export async function searchRepositoriesWithZeroRetries(
  initialQuery: string,
  maxRareWordRetries = 2
): Promise<SearchWithRetryResult> {
  const queriesTried: string[] = [];
  let q = initialQuery.trim();

  for (let attempt = 0; attempt <= maxRareWordRetries; attempt++) {
    queriesTried.push(q);
    const { items, total_count } = await searchRepositories(q);
    if (total_count > 0) {
      return { items, total_count, queriesTried };
    }
    if (attempt === maxRareWordRetries) {
      return { items, total_count, queriesTried };
    }
    const word = await identifyRareWord(q);
    if (!word) {
      return { items: [], total_count: 0, queriesTried };
    }
    const next = removeWordFromQuery(q, word);
    if (!next.trim() || next === q) {
      return { items: [], total_count: 0, queriesTried };
    }
    q = next;
  }

  return { items: [], total_count: 0, queriesTried };
}
