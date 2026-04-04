# ARCHITECTURE.md — System Design and Patterns

## System Overview

`ollama-models` is a **scraper-backed API + multi-language client SDK** monorepo. It surfaces Ollama model registry data (model search and tag listings) through a structured HTTP API, since `ollama.com` has no official public API.

```
ollama.com (HTML source)
      │
      │  HTTP fetch + CSS selector parsing
      ▼
┌─────────────────────────────────────────────────────┐
│          api/  (Cloudflare Workers)                 │
│                                                     │
│  GET /search  ──▶  search/scraper.ts                │
│  GET /model   ──▶  model/scraper.ts                 │
│  GET /health  ──▶  runHealthCheck()                 │
│                          │                          │
│           Hono router + withCache() wrapper         │
│           Cloudflare Cache API (60s / 300s TTL)     │
└──────────────────────────┬──────────────────────────┘
                           │  JSON over HTTP
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
  packages/ts-client  packages/py-client  Direct HTTP
  (OllamaModelsClient) (OllamaModelsClient)  consumers
```

## Architectural Pattern: Scraper Facade

The core pattern is a **thin HTTP facade over a web scraper**:

1. **Scraper layer** — fetches raw HTML from `ollama.com`, parses with CSS selectors, returns typed objects
2. **Router layer** — Hono routes validate inputs, call scrapers, wrap responses in typed JSON
3. **Cache layer** — `withCache()` higher-order function intercepts routes and serves `caches.default` hits before reaching scrapers
4. **Client layer** — TS and Python SDKs call the Workers API and perform runtime type validation on responses

## Layers

### API (`api/src/`)

```
index.ts            ← Hono app, routes, cron handler, cache wrapper, alert logic
constants.ts        ← OLLAMA_BASE, FETCH_HEADERS
search/
  scraper.ts        ← scrapeSearchPage() — fetches and parses HTML
  types.ts          ← ModelPage, SearchResult, PageRange
  search.ts         ← search() — multi-page + retry coordinator
model/
  scraper.ts        ← scrapeModelPage() — fetches /tags page, returns ModelTags
  types.ts          ← ModelTags
```

### TypeScript Client (`packages/ts-client/src/`)

```
index.ts        ← public re-exports
client.ts       ← OllamaModelsClient class (search, getModel, health)
schemas.ts      ← assertXxx() runtime validators (no external schema library)
types.ts        ← mirrors api types: ModelPage, SearchResult, ModelTags, HealthStatus
```

### Python Client (`packages/py-client/src/ollama_models/`)

```
__init__.py     ← public re-exports
client.py       ← OllamaModelsClient (sync + async via httpx)
types.py        ← dataclass mirror of API types
```

## Data Flow: Search Request

```
User → GET /search?q=qwen3&page=1
  → withCache(60s): check caches.default
    → HIT: return cached Response
    → MISS: scrapeSearchPage(1, "qwen3")
        → fetch("https://ollama.com/search?q=qwen3&page=1", { headers })
        → parse HTML, querySelectorAll("a.group.w-full")
        → assert(pages.length > 0)
        → return ModelPage[]
      → build SearchResult JSON
      → cache.put(cacheKey, response, 60s)
      → return Response
```

## Cache Strategy

Implemented as `withCache(ttl, handler)` in `api/src/index.ts`:
- Cache key = full request URL (`new Request(c.req.url)`)
- `/search` — 60s TTL (new models surface quickly)
- `/model` — 300s TTL (tag changes less frequent)
- `/health` — **not cached** (must always reflect live scraper state)
- Cache invalidation: time-based only (no manual invalidation)

## Error Handling Strategy

- Scraper errors (HTTP failures, selector mismatch) throw `Error` with descriptive messages
- `assert()` from `es-toolkit/util` used for post-parse validation (selector returned 0 results)
- Route handlers catch all scraper errors and return `500 { error: string }`
- Alert webhook called on scraper error if `ALERT_WEBHOOK_URL` is set (fire-and-forget)
- Alert delivery failures are silently swallowed so they never interfere with request handling

## Health Check Architecture

Hourly cron (`wrangler.toml: crons = ["0 * * * *"]`) calls `runHealthCheck()`:
- Probes `scrapeSearchPage(1, "qwen")` with keyword `"qwen"`
- Probes `scrapeModelPage({ http_url: "https://ollama.com/library/qwen3", ... })`
- Returns structured `HealthStatus` with per-check `ok`, `count`, and `error` fields
- `GET /health` also calls `runHealthCheck()` live (no caching)
- On failure: POSTs detailed Slack-compatible mrkdwn alert to `ALERT_WEBHOOK_URL`

## Naming Conventions for Model IDs

A key domain concept: `model_id` is always `{profile}/{name}`:
- `library/{name}` — official Ollama-maintained models (e.g. `library/qwen3`)
- `{username}/{name}` — community models (e.g. `alibayram/smollm3`)
- Tags are pull-ready: `library/` prefix stripped for official models (e.g. `qwen3:latest`), kept for community models (e.g. `RogerBen/custom-model:v1`)
