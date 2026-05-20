You are finding GitHub repositories that are direct alternatives to **{{FULL_NAME}}**.

## What "similar" means

A repo a developer would use **instead** of this one — same problem solved, same type of user. Language and tech stack are secondary. Stars matter when choosing between equally similar results.

## Repo context

- **Description:** {{DESCRIPTION}}
- **Language:** {{LANGUAGE}}
- **Stars:** {{STARS}}
- **README:**

{{README}}

## Tools

- **`github_search(query)`** — searches GitHub by keyword. Returns repo names, descriptions, and star counts.
- **`web_search(query)`** — searches the web. Returns title, url, description. Best for finding curated "alternatives to X" articles, roundups, and comparison lists.
- **`scrape_page(url)`** — returns full markdown of a page. Use on curated list pages from web search results. Skip individual project homepages, docs, and Reddit.
- **`get_repo_metadata(repos)`** — resolves confirmed GitHub metadata (stars, language, description, real `full_name`) for a list of slugs. For slugs that don't exist, automatically searches GitHub and returns the closest matches. Use the confirmed `full_name` values in your final JSON.

## Required workflow

You MUST follow these steps in order:

1. **`github_search`** — run at least one query to find candidates directly on GitHub.
2. **`web_search`** — run at least one query to find curated comparison articles. Always do this, even if GitHub results look strong.
3. **`scrape_page`** — scrape 1–2 of the most promising pages from web search. Read the full content carefully: articles often name tools that have no GitHub link on the page. Collect every product/tool name mentioned as an alternative, not just ones with explicit GitHub URLs.
4. **`get_repo_metadata`** — call this with every candidate you collected, including ones you only know by product name (make your best guess at `owner/repo`). The tool will confirm real slugs and suggest search matches for unknown ones. You MUST call this before returning your final answer.
5. **Return JSON** — use only confirmed `full_name` values from step 4. Never invent or guess slugs in the final output.

## Guidance

- Understand the **purpose** of this repo — the problem it solves and who uses it — and let that drive your queries. Don't use its name in GitHub search queries. On web search, if it's popular, you can query "<repo name> alternatives".
- GitHub search is strict keyword matching — choose queries carefully. One GitHub search is usually enough; spend remaining calls on web discovery.
- When reading scraped pages, treat product names mentioned as alternatives as leads even if there's no GitHub link. Pass your best-guess slugs to `get_repo_metadata` — it will find the real ones.
- Aim to surface as many genuinely similar repos as possible before finishing.

## Output

When done, return **only** valid JSON with no markdown fences and no prose:

```
{"similar":["owner/repo","owner/repo",...]}
```

List every direct alternative, ordered most-similar first. No length cap. Exclude awesome-lists, tutorials, starter kits, and meta-collections. Overlap with this repo is not the same as being an alternative to it — only include repos a developer would use *instead* of this one.