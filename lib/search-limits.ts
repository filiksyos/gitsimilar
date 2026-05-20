/** Max similar repos returned from /api/find-similar. */
export const MAX_SIMILAR_REPOS = 9;

/** Repos per batched GraphQL query (avoids complexity limits). */
export const GRAPHQL_STATS_BATCH_SIZE = 40;

/** Max tool calls per agentic search run (web_search, github_search, scrape_page). */
export const MAX_AGENT_TOOL_CALLS = 8;

/** Default GitHub search results per github_search call. */
export const GITHUB_SEARCH_LIMIT = 10;

/** Max GitHub search results per call. */
export const GITHUB_SEARCH_MAX = 30;

/** Default Firecrawl search result limit per web_search call. */
export const FIRECRAWL_SEARCH_LIMIT = 10;

/** Max markdown chars returned from scrape_page to the LLM. */
export const SCRAPE_MARKDOWN_MAX_CHARS = 8000;
