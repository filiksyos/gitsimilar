"use client";

import { useState, useRef, useEffect, type FormEvent, type ReactNode } from "react";
import { Star, GitFork, Search, Github, Loader2 } from "lucide-react";
import { HOME_EXAMPLES } from "@/lib/home-example-repos";
import type { SimilarResult } from "@/lib/types";

export interface SimilarHomeProps {
  initialRepo?: string;
  autoSubmit?: boolean;
}

export function SimilarHome({ initialRepo = "facebook/react", autoSubmit = false }: SimilarHomeProps) {
  const [input, setInput] = useState(initialRepo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimilarResult | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (result) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  const runSearch = async (repoInput: string) => {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/find-similar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: repoInput }),
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

  useEffect(() => {
    if (!autoSubmit || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    void runSearch(initialRepo);
  }, [autoSubmit, initialRepo]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await runSearch(input);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#fffdf8] text-zinc-900">
      <header className="sticky top-0 z-50 border-b-[3px] border-zinc-900 bg-[#fffdf8]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative shrink-0">
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
          <a
            href="https://github.com/filiksyos/gitsimilar"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-sm font-medium text-zinc-700 hover:text-zinc-900"
          >
            GitHub
          </a>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-12 px-4 py-12 sm:px-6">
        <section className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-5xl font-extrabold tracking-tighter text-zinc-900 md:text-7xl">
            Find <span className="text-[#16a34a]">similar</span> repos
          </h2>
          <p className="mb-10 text-lg text-zinc-600">
            Find other repos with the same tech stack.
          </p>

          <form onSubmit={onSubmit} className="relative mx-auto max-w-xl">
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-xl bg-zinc-900" aria-hidden />
            <div className="relative z-10 rounded-xl border-[3px] border-zinc-900 bg-[#f0fdf4] p-4 text-left sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
                <div className="relative min-w-0 flex-1">
                  <div className="absolute inset-0 translate-x-1 translate-y-1 rounded-lg bg-zinc-900" aria-hidden />
                  <div className="relative z-10 w-full rounded-lg border-[3px] border-zinc-900 bg-white px-3 py-2.5">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="https://github.com/..."
                      className="block w-full border-0 bg-transparent py-0.5 text-left text-sm text-zinc-900 outline-none placeholder:text-left placeholder:text-zinc-500"
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
              {!loading && (
                <div className="mt-4 flex flex-wrap justify-start gap-2 text-left">
                  <span className="w-full text-left text-sm text-zinc-600">Try example repos:</span>
                  {HOME_EXAMPLES.map(({ label, url }) => (
                    <div key={url} className="group relative">
                      <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-lg bg-zinc-900" aria-hidden />
                      <button
                        type="button"
                        onClick={() => setInput(url)}
                        className="relative z-10 rounded-lg border-[3px] border-zinc-900 bg-[#d1fae5] px-3 py-1 text-sm font-medium text-zinc-900 transition-transform hover:bg-[#16a34a] hover:text-white group-hover:-translate-x-px group-hover:-translate-y-px"
                      >
                        {label}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {error && (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-500">
            You can also replace{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">hub</code> with{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-700">similar</code> in any
            GitHub URL.
          </p>
        </section>

        {result && (
          <section ref={resultsRef} className="scroll-mt-8">
            <h3 className="mb-1 text-2xl font-bold text-zinc-900">Similar repositories</h3>
            <p className="mb-6 text-sm text-zinc-500">
              {result.similar.length} {result.similar.length === 1 ? "match" : "matches"} found
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {result.similar.map((r) => (
                <RepoCard key={r.id} repo={r} />
              ))}
            </div>
          </section>
        )}
      </main>
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
