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
  /** Which root dependency file drove the similarity (e.g. `package.json`). */
  similarityFile?: string;
  /** All dependency names parsed from the file. */
  extractedDeps?: string[];
  /** AND-group deps used in the final query (vendor-locked). */
  andDeps?: string[];
  /** OR-group deps used in the final query (substitutable). */
  orDeps?: string[];
  /** All queries attempted (shrinking AND deps); useful for debugging. */
  queriesTried?: string[];
};
