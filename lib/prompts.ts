import type { OpenRouterMessage } from "@/lib/openrouter";

export type DepSelection = {
  and: string[];
  or: string[];
};

/** Classify dependency names into AND (vendor-locked) vs OR (substitutable) groups. */
const SELECT_DEPS_SYSTEM =
  "You are helping find GitHub repositories that use a similar technology stack.\n" +
  "You will receive a JSON array of dependency/package NAMES from ONE repository's dependency file " +
  "(package.json, requirements.txt, Cargo.toml, etc.).\n\n" +
  "Task: Classify dependencies into two groups for a GitHub code search query:\n\n" +
  "**and** — vendor-locked dependencies with no realistic substitute that uses a different package name. " +
  "Every similar repo doing the same thing will have these exact names. " +
  "Examples: stripe, @supabase/supabase-js, grammy, @modelcontextprotocol/sdk, resend.\n\n" +
  "**or** — substitutable dependencies where similar repos might pick a different package for the same need. " +
  "At least one should appear in matches, but the specific name may differ. " +
  "Examples: framer-motion (vs gsap), lucide-react (vs react-icons), openai (vs @google/genai).\n\n" +
  "Rules:\n" +
  "- Skip generic toolchain deps that appear in thousands of projects (react, react-dom, next, typescript, eslint, tailwindcss, chalk, commander, dotenv, axios, lodash, undici, zod unless it is clearly central to the app's purpose).\n" +
  "- Skip private or scoped packages unlikely to appear in other repos (@openclaw/*, @earendil-works/*, etc.).\n" +
  "- Only pick names present in the input list. Preserve exact spelling and casing.\n" +
  "- Put at least 1 item in **and** when possible. Use **or** for nice-to-have signals.\n" +
  "- Order **and** from most distinctive/stack-defining first to most generic last (last can be dropped on retry).\n" +
  "- Max 3 in **and**, max 4 in **or**.\n\n" +
  "Return ONLY valid JSON, no markdown, no prose. Example:\n" +
  '{"and":["stripe","@supabase/supabase-js"],"or":["framer-motion","posthog-js"]}';

export function buildDepSelectionPrompt(allDeps: string[]): OpenRouterMessage[] {
  return [
    { role: "system", content: SELECT_DEPS_SYSTEM },
    {
      role: "user",
      content: JSON.stringify(allDeps.sort((a, b) => a.localeCompare(b))),
    },
  ];
}

function stripJsonFences(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "");
  s = s.replace(/\s*```\s*$/i, "");
  return s.trim();
}

function filterAllowed(names: unknown, allowed: Set<string>, max: number): string[] {
  if (!Array.isArray(names)) return [];
  const out: string[] = [];
  for (const item of names) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name || !allowed.has(name)) continue;
    if (!out.includes(name)) out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/** Parse LLM JSON object; validate every entry exists in the original dep set. */
export function parseDepSelection(raw: string, allDeps: string[]): DepSelection {
  const allowed = new Set(allDeps);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    console.warn("[gitsimilar] Failed to parse dep-selection JSON");
    return { and: [], or: [] };
  }
  if (!parsed || typeof parsed !== "object") return { and: [], or: [] };

  const obj = parsed as Record<string, unknown>;
  return {
    and: filterAllowed(obj.and, allowed, 3),
    or: filterAllowed(obj.or, allowed, 4),
  };
}
