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
  reasoning: string;
};
