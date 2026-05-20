import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type FirecrawlSearchResultItem = {
  position: number;
  title: string;
  url: string;
  description: string;
};

export type SearchLogSearchEntry = {
  query: string;
  results: FirecrawlSearchResultItem[];
  foundNames: string[];
  error: string | null;
  durationMs: number;
};

export type SearchLogScrapeEntry = {
  url: string;
  foundNames: string[];
  error: string | null;
  durationMs: number;
};

export type SearchLogGithubResultItem = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
};

export type SearchLogGithubEntry = {
  query: string;
  results: SearchLogGithubResultItem[];
  foundNames: string[];
  error: string | null;
  durationMs: number;
};

export type SearchLogSimilarRepo = {
  full_name: string;
  stargazers_count: number;
  language: string | null;
  description: string | null;
};

export type SearchLog = {
  timestamp: string;
  source: string;
  readmeChars: number;
  searches: SearchLogSearchEntry[];
  githubSearches: SearchLogGithubEntry[];
  scrapes: SearchLogScrapeEntry[];
  agentSimilarNames: string[];
  similar: SearchLogSimilarRepo[];
  reasoning: string | null;
  toolCalls: number;
  totalDurationMs: number;
  error: string | null;
};

function shouldWriteSearchLogs(): boolean {
  return (
    process.env.NODE_ENV !== "production" || process.env.GITSIMILAR_LOG === "1"
  );
}

function formatLogTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join("-") +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

function buildLogFilename(source: string, timestamp: Date): string {
  const safeSource = sanitizeFilenamePart(source.replace(/\//g, "_"));
  return `${formatLogTimestamp(timestamp)}_${safeSource}.json`;
}

export async function writeSearchLog(log: SearchLog): Promise<void> {
  if (!shouldWriteSearchLogs()) return;

  try {
    const logsDir = path.join(process.cwd(), "logs");
    await mkdir(logsDir, { recursive: true });

    const filename = buildLogFilename(log.source, new Date(log.timestamp));
    const filePath = path.join(logsDir, filename);
    await writeFile(filePath, JSON.stringify(log, null, 2), "utf-8");
  } catch (e) {
    console.warn(
      "[gitsimilar] Failed to write search log:",
      e instanceof Error ? e.message : e
    );
  }
}
