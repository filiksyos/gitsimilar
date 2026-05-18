"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Star, GitFork, Search, Github, Loader2, ExternalLink } from "lucide-react";
import type { SimilarResult } from "@/lib/types";

export default function HomePage() {
  const [input, setInput] = useState("facebook/react");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimilarResult | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/find-similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: unknown }).error)
            : `Request failed (${res.status})`;
        throw new Error(msg);
      }
      setResult(data as SimilarResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#fffdf8] text-zinc-900">
      <header className="sticky top-0 z-50 border-b-[3px] border-zinc-900 bg-[#fffdf8]">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <div className="relative">
            <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg bg-zinc-900" aria-hidden />
            <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-lg border-[3px] border-zinc-900 bg-[#16a34a]">
              <Github className="h-4 w-4 text-white" />
            </div>
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight">
            <span className="text-zinc-900">git</span>
            <span className="text-[#16a34a]">similar</span>
          </h1>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-12 sm:px-6">
        <section className="mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border-[2px] border-zinc-900 bg-[#f0fdf4] px-3 py-1 text-xs font-semibold text-zinc-800">
            <Github className="h-3 w-3 text-[#16a34a]" />
            Env-template + GitHub code search discovery
          </div>
          <h2 className="mb-4 text-5xl font-extrabold tracking-tighter text-zinc-900 md:text-7xl">
            Find <span className="text-[#16a34a]">similar</span> repos
          </h2>
          <p className="mb-10 text-lg text-zinc-600">
            Paste a GitHub repo with a root `.env.example` — we pick shared API keys via AI and find other repos declaring the same stack.
          </p>

          <form onSubmit={onSubmit} className="relative mx-auto max-w-xl">
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" aria-hidden />
            <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#f0fdf4] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
                <div className="relative min-w-0 flex-1">
                  <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" aria-hidden />
                  <div className="relative z-10 flex items-center gap-2 rounded-lg border-[3px] border-zinc-900 bg-white px-3 py-2.5">
                    <Github className="h-5 w-5 shrink-0 text-zinc-500" />
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="owner/repo or https://github.com/owner/repo"
                      className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="relative shrink-0 sm:self-stretch">
                  <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-800" aria-hidden />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="relative z-10 inline-flex h-full w-full min-h-[42px] items-center justify-center gap-1.5 rounded-lg border-[3px] border-zinc-900 bg-[#16a34a] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#15803d] disabled:opacity-50 sm:min-w-[100px]"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Find
                  </button>
                </div>
              </div>
            </div>
          </form>

          {error && (
            <div className="mt-4 inline-block rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}
        </section>

        {result && (
          <section className="space-y-8">
            <SourceCard result={result} />
            <div>
              <h3 className="mb-1 text-2xl font-bold text-zinc-900">Similar repositories</h3>
              <p className="mb-6 text-sm text-zinc-500">{result.similar.length} matches found</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {result.similar.map((r) => (
                  <RepoCard key={r.id} repo={r} />
                ))}
              </div>
            </div>
          </section>
        )}

        {!result && !loading && (
          <section className="mx-auto mt-0 grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
            {["facebook/react", "vercel/next.js", "tailwindlabs/tailwindcss", "tanstack/query"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="truncate rounded-lg border-[2px] border-zinc-900 bg-[#d1fae5] px-3 py-2 text-xs font-medium text-zinc-900 transition-colors hover:bg-[#16a34a] hover:text-white"
              >
                {s}
              </button>
            ))}
          </section>
        )}
      </main>

      <footer className="border-t border-zinc-200 py-6 text-center text-sm text-zinc-500">
        GitSimilar — discover repos that share your stack
      </footer>
    </div>
  );
}

function SourceCard({ result }: { result: SimilarResult }) {
  const r = result.source;
  return (
    <div className="group relative">
      <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-2xl bg-zinc-900" aria-hidden />
      <div className="relative z-10 rounded-2xl border-[3px] border-zinc-900 bg-[#f0fdf4] p-6">
        <div className="flex items-start gap-4">
          <img src={r.owner.avatar_url} alt={r.owner.login} className="h-12 w-12 rounded-lg border-[2px] border-zinc-900" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <a
                href={r.html_url}
                target="_blank"
                rel="noreferrer"
                className="font-display truncate text-lg font-bold text-zinc-900 hover:text-[#16a34a]"
              >
                {r.full_name}
              </a>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            </div>
            <p className="mb-3 text-sm text-zinc-600">{r.description ?? "No description"}</p>
            <p className="mb-3 text-sm italic text-zinc-800">&quot;{result.reasoning}&quot;</p>
            {(result.codeSearchQuery ?? result.extractedKeys?.length ?? result.queriesTried?.length) && (
              <details className="mb-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left">
                <summary className="cursor-pointer text-xs font-semibold text-zinc-600 hover:text-zinc-900">
                  GitHub code search details
                </summary>
                <div className="mt-3 space-y-3 text-xs">
                  {result.similarityFile && (
                    <div>
                      <div className="mb-1 font-medium text-zinc-500">Similarity file</div>
                      <code className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px]">
                        {result.similarityFile}
                      </code>
                    </div>
                  )}
                  {result.extractedKeys && result.extractedKeys.length > 0 && (
                    <div>
                      <div className="mb-1 font-medium text-zinc-500">Env keys searched</div>
                      <div className="flex flex-wrap gap-1">
                        {result.extractedKeys.map((k) => (
                          <span
                            key={k}
                            className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-800"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.codeSearchQuery && (
                    <div>
                      <div className="mb-1 font-medium text-zinc-500">Final query (`q=`)</div>
                      <pre className="whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-800">
                        {result.codeSearchQuery.trim()}
                      </pre>
                    </div>
                  )}
                  {result.queriesTried && result.queriesTried.length > 1 && (
                    <div>
                      <div className="mb-1 font-medium text-zinc-500">Retries (dropped least important keys)</div>
                      <div className="max-h-32 space-y-1 overflow-y-auto">
                        {result.queriesTried.map((q, i) => (
                          <pre
                            key={i}
                            className="whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-2 text-[10px] leading-relaxed text-zinc-800"
                          >
                            {q}
                          </pre>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            )}
            <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
              <Stat icon={<Star className="h-3 w-3" />} value={r.stargazers_count.toLocaleString()} />
              <Stat icon={<GitFork className="h-3 w-3" />} value={r.forks_count.toLocaleString()} />
              {r.language && (
                <span className="rounded-md border-[2px] border-zinc-900 bg-zinc-100 px-2 py-0.5 font-medium text-zinc-900">
                  {r.language}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RepoCard({ repo }: { repo: SimilarResult["similar"][number] }) {
  return (
    <div className="group relative h-full">
      <div
        className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-xl bg-zinc-900 transition-transform duration-100 group-hover:translate-x-2 group-hover:translate-y-2"
        aria-hidden
      />
      <a
        href={repo.html_url}
        target="_blank"
        rel="noreferrer"
        className="relative z-10 flex h-full min-h-[180px] -translate-x-0.5 -translate-y-0.5 flex-col rounded-xl border-[3px] border-zinc-900 bg-white p-5 transition-transform duration-100 group-hover:-translate-x-1 group-hover:-translate-y-1"
      >
        <div className="mb-3 flex items-center gap-3">
          <img src={repo.owner.avatar_url} alt="" className="h-8 w-8 rounded-md border-[2px] border-zinc-900" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-zinc-900 transition group-hover:text-[#16a34a]">
              {repo.full_name}
            </div>
            {repo.language && <div className="text-xs text-zinc-500">{repo.language}</div>}
          </div>
        </div>
        <p className="mb-3 flex-1 text-xs text-zinc-600 line-clamp-3">{repo.description ?? "No description"}</p>
        <div className="flex items-center gap-3 text-xs text-zinc-600">
          <Stat icon={<Star className="h-3 w-3" />} value={repo.stargazers_count.toLocaleString()} />
          <Stat icon={<GitFork className="h-3 w-3" />} value={repo.forks_count.toLocaleString()} />
        </div>
      </a>
    </div>
  );
}

function Stat({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {icon}
      {value}
    </span>
  );
}
