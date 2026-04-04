# CONVENTIONS.md — Code Style and Patterns

## TypeScript Style

### General

- **Strict mode** TypeScript throughout (`tsconfig.json` in each package)
- `import type` used for type-only imports (e.g. `import type { SearchResult } from './types'`)
- Prefer `const` over `let`; no `var`
- All public functions and interfaces documented with TSDoc (summary + `@param` + `@returns` + `@throws` + `@example`)
- Fields in interfaces documented with inline `/** ... */` JSDoc

### Naming

| Kind | Convention | Example |
|---|---|---|
| Functions | camelCase | `scrapeSearchPage`, `withCache`, `runHealthCheck` |
| Classes | PascalCase | `OllamaModelsClient` |
| Interfaces / Types | PascalCase | `ModelPage`, `SearchResult`, `ModelTags` |
| Constants | SCREAMING_SNAKE_CASE | `OLLAMA_BASE`, `FETCH_HEADERS`, `SEARCH_TTL` |
| Variables | camelCase | `cacheKey`, `fresh`, `pages` |
| Private class fields | `private readonly` prefix | `private readonly baseUrl: string` |
| Test helpers | camelCase | `mockFetch` |

### TSDoc Patterns

- Summary line: one concise sentence
- `@param` — each named parameter, skip if self-evident from type
- `@returns` — describes shape/type of return with cross-references (`{@link Type}`)
- `@throws` — every thrown error, including `assert` violations
- `@example` — always present for exported functions; shows realistic usage
- No `@remarks` tag (per user preference)
- No type repetition in comments (type shown by IDE)

```typescript
// Good pattern — seen throughout api/src/
/**
 * Fetches an Ollama search results page and returns unique model page URLs.
 *
 * @param page - 1-based page number to fetch.
 * @param keyword - Search keyword. Pass an empty string to list all models.
 * @returns {@link ModelPage} entries for every distinct model found on the page.
 * @throws {Error} When Ollama returns a non-2xx HTTP status.
 * @throws {Error} When the CSS selector matches zero elements.
 * @example
 * ```typescript
 * const pages = await scrapeSearchPage(1, 'qwen3');
 * ```
 */
```

### Error Handling

- `assert(condition, message)` from `es-toolkit/util` used for post-parse assertions (scraper integrity checks)
- Assert messages include the CSS selector and a human-readable explanation of what likely changed
- Route handlers catch all thrown errors with try/catch → `c.json({ error: String(err) }, 500)`
- Alert webhook calls are fire-and-forget — failure is silently swallowed with a `try/catch` containing no body
- Never rethrow from alert functions (they must not interfere with caller error handling)

### Hono Route Pattern

```typescript
app.get('/search', withCache(SEARCH_TTL, async (c) => {
  // 1. Parse and validate query params (clamp/default instead of reject where sensible)
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const keyword = c.req.query('q') ?? '';

  try {
    // 2. Call scraper
    const pages = await scrapeSearchPage(page, keyword);
    // 3. Build typed response
    const result: SearchResult = { pages, page_range: page, keyword };
    return c.json(result);
  } catch (err) {
    // 4. Optional: fire-and-forget alert
    if (c.env?.ALERT_WEBHOOK_URL) { ... }
    // 5. Return 500
    return c.json({ error: String(err) }, 500);
  }
}));
```

### Deduplication Pattern

Both scrapers use a `Set<string>` to deduplicate results before pushing to the output array:
```typescript
const seen = new Set<string>();
for (const el of root.querySelectorAll('a.group.w-full')) {
  const http_url = ...;
  if (!seen.has(http_url)) {
    seen.add(http_url);
    pages.push(...);
  }
}
```

## Python Style

- **Type annotations** throughout (Python 3.8+ compatible, using `from __future__ import annotations`)
- `dataclass` used for all data types (`@dataclass` in `types.py`)
- Sync and async variants exposed as paired methods: `search()` / `search_async()`, `get_model()` / `get_model_async()`
- `httpx.Client` context manager for sync, `httpx.AsyncClient` for async
- Internal parser functions (not methods) handle JSON → dataclass conversion: `_parse_search_result()`, `_parse_model_tags()`
- `Optional[str]` used for nullable fields (not `str | None` for Python 3.8 compatibility)
- Test fixtures defined at module level as constants (`MOCK_SEARCH`, `MOCK_MODEL`, `MOCK_HEALTH`)

## Shared Patterns Across TS and Python

- Identical type shapes on both sides (Python `dataclass` mirrors TS `interface`)
- Both clients strip trailing slashes from `base_url` in the constructor
- Both clients accept an optional `base_url` / `baseUrl` to point at a self-hosted instance
- Default base URL: `https://ollama-models-api.devcomfort.workers.dev` (defined as a module-level constant)
- Both perform runtime validation on API responses (TS: `assertXxx()`, Python: `_parse_xxx()` with `KeyError` / `TypeError`)

## Section Separator Pattern (TS)

Consistent visual separators used throughout:
```typescript
// ─── Section Name ─────────────────────────────────────────────────
```
Width approximately 72 characters. Used in both source (`index.ts`) and test files.
