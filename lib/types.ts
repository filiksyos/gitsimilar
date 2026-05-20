export type Repo = {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  owner: { login: string; avatar_url: string };
};

export type SimilarResult = {
  source: Repo;
  similar: Repo[];
  /** Human-readable summary line for the UI. */
  reasoning: string;
};

export type SearchEvent =
  | { type: "status"; message: string }
  | { type: "search"; query: string; mode: "github" | "web"; index: number }
  | { type: "result"; source: Repo; similar: Repo[]; reasoning: string }
  | { type: "error"; message: string };
