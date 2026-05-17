# GitSimilar

Find GitHub repositories similar to one you paste — Next.js app using **OpenRouter** (one call outputs **three diversified search queries** as JSON) plus **GitHub Search** and the **GitHub REST API** (metadata + README).

Ported from **git-matchmaker** (TanStack Start): same UI and dark theme, **without** gradient/glow styling.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Add OPENROUTER_API_KEY (required). Optionally GITHUB_TOKEN for higher GitHub limits.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key (OpenAI-compatible chat completions) |
| `OPENROUTER_MODEL` | No | Defaults to `openai/gpt-4o-mini` |
| `GITHUB_TOKEN` | No | `Bearer` token for GitHub REST (higher rate limits) |

## How it works

1. Parses `owner/repo` or a GitHub URL.
2. Loads the source repo from GitHub REST (description, topics, language, default branch) and fetches the README.
3. Runs **one** OpenRouter call that returns JSON `{"q1","q2","q3"}` — three **diverse** purpose-focused GitHub search phrases (mutually exclusive wording, no repo slug in queries; gitsearchai-style keyword discipline).
4. Runs **`GET /search/repositories`** once per query (sorted by stars). If a search returns zero hits, retries with gitsearchai-style **rare-word removal** via the LLM (up to a few trims per query).
5. **Merges** result lists by how many queries surfaced each repo (and first-seen order), yields up to **12** repos.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
