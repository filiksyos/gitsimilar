import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRepoInput } from "@/lib/parse-repo";
import { ghFetch, toRepo } from "@/lib/github";
import { discoverSimilarReposWithWebSearch } from "@/lib/openai";
import type { Repo, SimilarResult } from "@/lib/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  input: z.string().trim().min(1).max(300),
});

async function fetchRepoSafe(fullName: string): Promise<Repo | null> {
  try {
    const url = `https://api.github.com/repos/${fullName}`;
    const data = (await ghFetch(url)) as Record<string, unknown>;
    return toRepo(data);
  } catch {
    return null;
  }
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
    const source = toRepo(repoData);

    const { reasoning, fullNames } = await discoverSimilarReposWithWebSearch(source);

    const similar: Repo[] = [];
    const seen = new Set<string>();

    for (const fullName of fullNames) {
      if (similar.length >= 12) break;
      const lower = fullName.toLowerCase();
      if (lower === source.full_name.toLowerCase()) continue;
      if (seen.has(lower)) continue;

      const r = await fetchRepoSafe(fullName);
      if (!r) continue;

      const rl = r.full_name.toLowerCase();
      if (rl === source.full_name.toLowerCase()) continue;
      if (seen.has(rl)) continue;

      seen.add(rl);
      similar.push(r);
    }

    const payload: SimilarResult = { source, similar, reasoning };
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
