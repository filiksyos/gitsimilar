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
    <div className="min-h-screen">
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-10 bg-background/70">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Github className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            git<span className="text-primary">similar</span>
          </h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24">
        <section className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/60 bg-card/50 text-xs text-muted-foreground mb-6">
            <Github className="w-3 h-3 text-primary" />
            Env-template + GitHub code search discovery
          </div>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
            Find <span className="text-primary">similar</span> repos
          </h2>
          <p className="text-muted-foreground text-lg mb-10">
            Paste a GitHub repo with a root `.env.example` — we pick shared API keys via AI and find other repos declaring the same stack.
          </p>

          <form onSubmit={onSubmit} className="relative max-w-xl mx-auto">
            <div className="flex items-center gap-2 p-2 rounded-2xl border border-border bg-card/80 backdrop-blur focus-within:ring-2 focus-within:ring-ring transition">
              <div className="pl-3 text-muted-foreground">
                <Github className="w-5 h-5" />
              </div>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="owner/repo or https://github.com/owner/repo"
                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground py-2 text-sm"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Find
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-2 inline-block">
              {error}
            </div>
          )}
        </section>

        {result && (
          <section className="mt-16 space-y-8">
            <SourceCard result={result} />
            <div>
              <h3 className="text-2xl font-bold mb-1">Similar repositories</h3>
              <p className="text-sm text-muted-foreground mb-6">{result.similar.length} matches found</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {result.similar.map((r) => (
                  <RepoCard key={r.id} repo={r} />
                ))}
              </div>
            </div>
          </section>
        )}

        {!result && !loading && (
          <section className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto">
            {["facebook/react", "vercel/next.js", "tailwindlabs/tailwindcss", "tanstack/query"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="px-3 py-2 text-xs rounded-lg border border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-primary/50 transition truncate"
              >
                {s}
              </button>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function SourceCard({ result }: { result: SimilarResult }) {
  const r = result.source;
  return (
    <div className="rounded-2xl border border-primary/30 bg-card/60 backdrop-blur p-6">
      <div className="flex items-start gap-4">
        <img src={r.owner.avatar_url} alt={r.owner.login} className="w-12 h-12 rounded-lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <a
              href={r.html_url}
              target="_blank"
              rel="noreferrer"
              className="font-display font-bold text-lg hover:text-primary truncate"
            >
              {r.full_name}
            </a>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">{r.description ?? "No description"}</p>
          <p className="text-sm text-foreground/80 italic mb-3">&quot;{result.reasoning}&quot;</p>
          {(result.codeSearchQuery ?? result.extractedKeys?.length ?? result.queriesTried?.length) && (
            <details className="mb-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-left">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
                GitHub code search details
              </summary>
              <div className="mt-3 space-y-3 text-xs">
                {result.similarityFile && (
                  <div>
                    <div className="font-medium text-muted-foreground mb-1">Similarity file</div>
                    <code className="rounded-md bg-muted/30 px-2 py-1 text-[11px]">{result.similarityFile}</code>
                  </div>
                )}
                {result.extractedKeys && result.extractedKeys.length > 0 && (
                  <div>
                    <div className="font-medium text-muted-foreground mb-1">Env keys searched</div>
                    <div className="flex flex-wrap gap-1">
                      {result.extractedKeys.map((k) => (
                        <span
                          key={k}
                          className="rounded-md border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] font-mono"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.codeSearchQuery && (
                  <div>
                    <div className="font-medium text-muted-foreground mb-1">Final query (`q=`)</div>
                    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/30 p-2 text-[11px] leading-relaxed">
                      {result.codeSearchQuery.trim()}
                    </pre>
                  </div>
                )}
                {result.queriesTried && result.queriesTried.length > 1 && (
                  <div>
                    <div className="font-medium text-muted-foreground mb-1">Retries (dropped least important keys)</div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {result.queriesTried.map((q, i) => (
                        <pre
                          key={i}
                          className="whitespace-pre-wrap break-words rounded-md bg-muted/20 p-2 text-[10px] leading-relaxed"
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
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <Stat icon={<Star className="w-3 h-3" />} value={r.stargazers_count.toLocaleString()} />
            <Stat icon={<GitFork className="w-3 h-3" />} value={r.forks_count.toLocaleString()} />
            {r.language && (
              <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground">{r.language}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RepoCard({ repo }: { repo: SimilarResult["similar"][number] }) {
  return (
    <a
      href={repo.html_url}
      target="_blank"
      rel="noreferrer"
      className="group rounded-xl border border-border bg-card/40 backdrop-blur p-5 hover:border-primary/60 hover:bg-card/70 transition flex flex-col"
    >
      <div className="flex items-center gap-3 mb-3">
        <img src={repo.owner.avatar_url} alt="" className="w-8 h-8 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate group-hover:text-primary transition">{repo.full_name}</div>
          {repo.language && <div className="text-xs text-muted-foreground">{repo.language}</div>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-3 flex-1 mb-3">{repo.description ?? "No description"}</p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Stat icon={<Star className="w-3 h-3" />} value={repo.stargazers_count.toLocaleString()} />
        <Stat icon={<GitFork className="w-3 h-3" />} value={repo.forks_count.toLocaleString()} />
      </div>
    </a>
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
