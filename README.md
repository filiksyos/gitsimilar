# GitSimilar

Find GitHub repositories whose **declared integrations** resemble another repo — by reading that repo's root `.env.example` style file (or `.env.local.example` / `.env.template` / `.env.sample`), using **Azure OpenAI** once to pick **shared-stack** env variable names, then searching with GitHub **`/search/code`** (scoped to the same filename, excluding forks).

## Setup

```bash
npm install
cp .env.local.example .env.local
# AZURE_OPENAI_API_KEY / AZURE_OPENAI_BASE_URL (required) — picks which keys to search.
# GITHUB_TOKEN (recommended) — code search is unreliable without auth; improves rate limits.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

| Variable               | Required | Purpose                                                                 |
| ---------------------- | -------- | ----------------------------------------------------------------------- |
| `AZURE_OPENAI_API_KEY` | Yes      | Azure OpenAI API key used for the chat completion call                   |
| `AZURE_OPENAI_BASE_URL` | Yes     | Azure OpenAI base URL, for example `https://.../openai/v1`               |
| `AZURE_OPENAI_MODEL`   | No       | Overrides the default Azure model slug (`gpt-5.4-mini`)                  |
| `GITHUB_TOKEN`         | Strongly recommended | Bearer token — **required by this app for `/search/code`**          |
| `GITSIMILAR_LOG_AI_OUTPUT` | No   | When `1`, logs selected keys + code-search queries server-side          |

## How it works

1. Parses `owner/repo` or a GitHub URL.
2. Fetches repo metadata (`GET /repos/...`), resolves `default_branch`.
3. Loads the repository **root commit tree**, finds the first of: `.env.example`, `.env.local.example`, `.env.template`, `.env.sample`.
4. Fetches file contents (`GET .../contents/...`).
5. Parses env variable names from both active assignments (`KEY=value`, `export KEY=`) and commented template vars (`# KEY=`) — the latter are common in `.env.example` files where all vars are shown as comments.
6. **One Azure OpenAI call** receives that list and returns JSON: **3–5** names likely to appear in **other repos** too (drops app-specific junk). Order matters: **most stack-defining first**, most generic **last**.
7. **`GET https://api.github.com/search/code`** with query like  
   `KEY1 KEY2 filename:.env.example NOT is:fork`  
   Using the matched filename (`.env.local.example`, etc.).
8. **Retry:** If nothing matches, drops the **last** selected key up to twice and repeats.
9. Deduplicates by repository, excludes the source repo, sorts by GitHub **`stargazers_count`**, keeps up to **100** (GraphQL-refreshed stars/forks/description).

Queries follow [Understanding GitHub code search syntax](https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax).

If the repo root has none of the supported env-template files, the API responds **400** with a clear message.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
