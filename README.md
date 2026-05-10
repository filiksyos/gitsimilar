# GitSimilar

Find GitHub repositories similar to one you paste — Next.js app using **OpenAI Responses API** (`web_search`) plus the **GitHub REST API**.

Ported from **git-matchmaker** (TanStack Start): same UI and dark theme, **without** gradient/glow styling.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Add OPENAI_API_KEY (required). Optionally GITHUB_TOKEN for higher GitHub limits.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for Responses API + hosted web search |
| `GITHUB_TOKEN` | No | `Bearer` token for GitHub REST (higher rate limits) |
| `OPENAI_MODEL` | No | Defaults to `gpt-4.1-mini` |

## How it works

1. Parses `owner/repo` or a GitHub URL.
2. Loads the source repo from GitHub REST.
3. Calls OpenAI **Responses** with the **`web_search`** tool to discover similar repos on the web.
4. Parses `github.com/owner/repo` URLs from the model output and hydrates each via GitHub REST.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
