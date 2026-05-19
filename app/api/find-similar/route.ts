import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRepoInput } from "@/lib/parse-repo";
import { batchFetchRepoStats, getFileContent, getRootTree, ghFetch, type TreeEntry, toRepo } from "@/lib/github";
import { parseEnvKeys } from "@/lib/env-extractor";
import { SIMILARITY_FILES, searchCodeWithRetry } from "@/lib/code-search-query";
import {
  CODE_SEARCH_PER_PAGE,
  GRAPHQL_STATS_BATCH_SIZE,
  MAX_SIMILAR_REPOS,
} from "@/lib/search-limits";
import { buildKeySelectionPrompt, parseSelectedKeys } from "@/lib/prompts";
import { callOpenRouter } from "@/lib/openrouter";
import type { Repo, SimilarResult } from "@/lib/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  input: z.string().trim().min(1).max(300),
});

function shouldLogSearchQueries(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.GITSIMILAR_LOG_AI_OUTPUT === "1"
  );
}

function findSimilarityFileAtRoot(tree: TreeEntry[]): string | null {
  const blobs = tree.filter((e) => e.type === "blob").map((e) => e.path);
  const blobSet = new Set(blobs);
  for (const name of SIMILARITY_FILES) {
    if (blobSet.has(name)) return name;
  }
  return null;
}

/** Drop source repo, sort by popularity, limit. */
function finalizeSimilarRepos(candidates: Repo[], sourceFullName: string): Repo[] {
  const lower = sourceFullName.toLowerCase();
  const filtered = candidates.filter((r) => r.full_name.toLowerCase() !== lower);
  filtered.sort((a, b) => {
    const star = b.stargazers_count - a.stargazers_count;
    if (star !== 0) return star;
    return (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });
  return filtered.slice(0, MAX_SIMILAR_REPOS);
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
      parsed.error.issues.map((issue) => issue.message).join("; ") ||
      "Invalid input.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const { owner, repo } = parseRepoInput(parsed.data.input);
    const repoData = (await ghFetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    )) as Record<string, unknown>;
    const branch =
      typeof repoData.default_branch === "string" && repoData.default_branch.length > 0
        ? repoData.default_branch
        : "main";

    const source = toRepo(repoData);

    const tree = await getRootTree(owner, repo, branch);
    const similarityFile = findSimilarityFileAtRoot(tree);
    if (!similarityFile) {
      return NextResponse.json(
        {
          error:
            "No .env.example (or variant such as .env.local.example / .env.template / .env.sample) found at the repository root.",
        },
        { status: 400 }
      );
    }

    let envRaw: string;
    try {
      envRaw = await getFileContent(owner, repo, similarityFile, branch);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not read env template file.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const allKeys = parseEnvKeys(envRaw);
    if (allKeys.length === 0) {
      return NextResponse.json(
        { error: "No recognizable environment variables in the template file." },
        { status: 400 }
      );
    }

    const rawPick = await callOpenRouter(buildKeySelectionPrompt(allKeys));
    const selectedKeys = parseSelectedKeys(rawPick, allKeys);

    if (selectedKeys.length === 0) {
      return NextResponse.json(
        {
          error:
            "AI could not select any shared-stack environment keys from this file. Ensure OPENROUTER_API_KEY is configured and retry.",
        },
        { status: 400 }
      );
    }

    const search = await searchCodeWithRetry(selectedKeys, similarityFile, {
      maxRetries: 2,
      perPage: CODE_SEARCH_PER_PAGE,
    });

    const dedupedCount = search.repos.length;

    if (shouldLogSearchQueries()) {
      const div = "=".repeat(72);
      console.log(
        `\n${div}\n[gitsimilar] Code search (${similarityFile}) for ${source.full_name}\n${div}`
      );
      console.log(JSON.stringify(selectedKeys));
      search.queriesTried.forEach((q, i) => console.log(`[try ${i + 1}] ${q}`));
      console.log(
        `[gitsimilar] code hits: ${search.total_count} · deduped repos: ${dedupedCount}`
      );
    }

    const statsMap = await batchFetchRepoStats(search.repos);

    if (shouldLogSearchQueries()) {
      const graphqlBatches = Math.ceil(dedupedCount / GRAPHQL_STATS_BATCH_SIZE);
      console.log(`[gitsimilar] GraphQL stats batches (est.): ${graphqlBatches}`);
    }

    const enriched = search.repos.map((r) => {
      const s = statsMap.get(r.full_name.toLowerCase());
      return s ? { ...r, ...s } : r;
    });

    const similar = finalizeSimilarRepos(enriched, source.full_name);

    if (shouldLogSearchQueries()) {
      console.log(`[gitsimilar] returned similar repos: ${similar.length}\n`);
    }

    if (similar.length === 0) {
      throw new Error(
        "No other repositories matched this env template search. Try loosening secrets in the env file or add more standard provider keys."
      );
    }

    const reasoningParts = [`file: ${similarityFile}`];
    if (search.keysUsed?.length)
      reasoningParts.push(`keys: ${search.keysUsed.join(", ")}`);
    reasoningParts.push(
      `${search.total_count.toLocaleString()} code matches on GitHub (up to ${MAX_SIMILAR_REPOS} similar repos below)`
    );

    const payload: SimilarResult = {
      source,
      similar,
      reasoning: reasoningParts.join(" · "),
      codeSearchQuery: search.queryUsed,
      similarityFile,
      extractedKeys: search.keysUsed,
      queriesTried: search.queriesTried,
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
    if (
      message.includes("GitHub API rate limit") ||
      message.includes("rate limit reached")
    ) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    if (message.includes("OPENROUTER_API_KEY")) {
      return NextResponse.json({ error: message }, { status: 500 });
    }
    if (
      message.includes("AI rate limit") ||
      message.toLowerCase().includes("rate limit hit")
    ) {
      return NextResponse.json({ error: message }, { status: 429 });
    }

    const status =
      message.includes("rate limit") || message.includes("Rate limit") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
