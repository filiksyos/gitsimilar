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

export type PromptResults = {
  /** Effective GitHub `q=` for diversified query slot 1 (`→` = rare-word retries). */
  tech: string;
  /** Slot 2 (historical field name `useCase`). */
  useCase: string;
  /** Slot 3 (historical field name `ecosystem`). */
  ecosystem: string;
};

export type SimilarResult = {
  source: Repo;
  similar: Repo[];
  /** Human-readable summary of queries used for GitHub search. */
  reasoning: string;
  /** Effective search queries per angle (optional for older clients). */
  promptResults?: PromptResults;
};
