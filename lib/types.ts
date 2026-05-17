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
  /** Final GitHub `q=` passed to `/search/code`. */
  codeSearchQuery?: string;
  /** Which root env template file drove the similarity (e.g. `.env.example`). */
  similarityFile?: string;
  /** Env variable names ultimately used in `codeSearchQuery`. */
  extractedKeys?: string[];
  /** All queries attempted (shrinking keys); useful for debugging. */
  queriesTried?: string[];
};
