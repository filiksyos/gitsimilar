import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRepoInput } from "@/lib/parse-repo";
import { getReadme, ghFetch, toRepo, truncateReadme } from "@/lib/github";
import { searchRepositoriesWithZeroRetries } from "@/lib/github-search-retry";
import { callOpenRouter } from "@/lib/openrouter";
import {
  buildDiverseSearchQueriesPrompt,
  parseQueryTriple,
} from "@/lib/prompts";
import type { Repo, SimilarResult } from "@/lib/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  input: z.string().trim().min(1).max(300),
});

function shouldLogSearchQueries(): boolean {
  return (
    process.env.NODE_ENV === "development" || process.env.GITSIMILAR_LOG_AI_OUTPUT === "1"
  );
}

/** Rank repos by how many of the three search lists include them, then first appearance. */
function aggregateRankedRepos(lists: [Repo[], Repo[], Repo[]], sourceFullName: string): Repo[] {
  const frequency = new Map<string, number>();
  const firstIndex = new Map<string, number>();
  const repoByKey = new Map<string, Repo>();
  let order = 0;
  const sourceLower = sourceFullName.toLowerCase();

  for (const list of lists) {
    const seenThisList = new Set<string>();
    for (const r of list) {
      const key = r.full_name.toLowerCase();
      if (key === sourceLower) continue;
      if (!firstIndex.has(key)) firstIndex.set(key, order);
      order += 1;
      if (!repoByKey.has(key)) repoByKey.set(key, r);
      if (seenThisList.has(key)) continue;
      seenThisList.add(key);
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }

  const keys = [...frequency.keys()];
  keys.sort((a, b) => {
    const fa = frequency.get(a) ?? 0;
    const fb = frequency.get(b) ?? 0;
    if (fb !== fa) return fb - fa;
    return (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0);
  });

  const out: Repo[] = [];
  for (const k of keys) {
    const repo = repoByKey.get(k);
    if (repo) out.push(repo);
    if (out.length >= 12) break;
  }
  return out;
}

function fallbackKeywordPool(ctx: {
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
}): string {
  return [
    ctx.language ?? "",
    ...ctx.topics,
    ctx.description ?? "",
    ctx.fullName.replace(/[/]/g, " "),
  ]
    .filter(Boolean)
    .join(" ");
}

export async function POST(req: Request): Promise<Response> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    const msg =
      parsed.error.issues.map((issue) => issue.message).join("; ") || "Invalid input.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const { owner, repo } = parseRepoInput(parsed.data.input);
    const repoData = (await ghFetch(`https://api.github.com/repos/${owner}/${repo}`)) as Record<
      string,
      unknown
    >;
    const branch =
      typeof repoData.default_branch === "string" && repoData.default_branch.length > 0
        ? repoData.default_branch
        : "main";

    const source = toRepo(repoData);
    const readmeRaw = await getReadme(owner, repo, branch);
    const readme = truncateReadme(readmeRaw);

    const ctx = {
      fullName: source.full_name,
      description: source.description,
      language: source.language,
      topics: source.topics,
      readme,
    };

    const pool = fallbackKeywordPool(ctx);

    const rawTriple = await callOpenRouter(buildDiverseSearchQueriesPrompt(ctx));
    const [q1, q2, q3] = parseQueryTriple(rawTriple, pool, source.full_name);

    if (shouldLogSearchQueries()) {
      const div = "=".repeat(72);
      console.log(
        `\n${div}\n[gitsimilar] GitHub search queries for ${source.full_name}\n${div}`
      );
      console.log(`[1] ${q1}`);
      console.log(`[2] ${q2}`);
      console.log(`[3] ${q3}\n`);
    }

    const [search1, search2, search3] = await Promise.all([
      searchRepositoriesWithZeroRetries(q1),
      searchRepositoriesWithZeroRetries(q2),
      searchRepositoriesWithZeroRetries(q3),
    ]);

    if (shouldLogSearchQueries()) {
      const logResult = (n: number, res: typeof search1, q: string) => {
        const retries = res.queriesTried.length > 1 ? ` → ${res.queriesTried.slice(1).join(" → ")}` : "";
        console.log(`[gitsimilar] [${n}] ${res.total_count} results — "${q}"${retries}`);
      };
      logResult(1, search1, q1);
      logResult(2, search2, q2);
      logResult(3, search3, q3);
    }

    const similar = aggregateRankedRepos(
      [search1.items, search2.items, search3.items],
      source.full_name
    );

    if (similar.length === 0) {
      throw new Error(
        "No repositories found via GitHub search for any of the generated queries. Try another repository or refine your README."
      );
    }

    const label1 = search1.queriesTried.join(" → ");
    const label2 = search2.queriesTried.join(" → ");
    const label3 = search3.queriesTried.join(" → ");

    const reasoning = [`"${label1}"`, `"${label2}"`, `"${label3}"`].join(", ");

    const payload: SimilarResult = {
      source,
      similar,
      reasoning: `Searched GitHub for: ${reasoning}`,
      promptResults: {
        tech: label1,
        useCase: label2,
        ecosystem: label3,
      },
    };
    return NextResponse.json(payload);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Something went wrong";

    if (message.startsWith("Enter a GitHub repo")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("Repository not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("GitHub API rate limit")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    if (message.includes("AI rate limit")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    const status = message.includes("rate limit") || message.includes("Rate limit") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
