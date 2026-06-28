# Architecture

**Date:** 2026-06-27

## Pattern

**Scraper-as-a-Service.** Ollama has no public registry API. This project
scrapes SSR HTML from `ollama.com` and re-exposes it as structured JSON through
a Cloudflare Workers edge API, with typed client SDKs for TypeScript and Python.

The overall shape is a **three-tier service**:

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│  SDK Clients  │────▶│   Workers API    │────▶│  ollama.com  │
│  (TS / Py)   │◀────│  (Hono + Zod)    │◀────│  (SSR HTML)  │
└──────────────┘     └──────────────────┘     └──────────────┘
                            │ tail events
                            ▼
                     ┌──────────────────┐
                     │  Alerts Worker   │──▶ Email
                     └──────────────────┘
```

## Layers

### 1. Clients (packages/ts-client, packages/py-client)

Thin HTTP wrappers over the Workers API. No business logic — only
request construction, response parsing, and runtime shape validation.

- **TypeScript:** `OllamaModelsClient` class with `search()`, `getModel()`,
  `health()`. Zero runtime dependencies (assertion via `es-toolkit`).
  Builds to CJS + ESM via tsdown. Published as `ollama-models` on npm.
- **Python:** `OllamaModelsClient` class with sync + async variants
  (`search` / `search_async`, etc.). Uses `httpx`. Published as
  `ollama-models` on PyPI. Types are `@dataclass` models.
- Both clients define their own type interfaces that mirror the API
  schemas. Schema drift is caught in CI by integration tests that
  route through the real Hono app.

### 2. Workers API (api/)

Single Cloudflare Worker built with **Hono** (OpenAPI variant) and **Zod**.

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Routes** | `src/routes/search.ts`, `model.ts`, `health.ts`, `openapi.ts` | OpenAPI route definitions + HTTP handler functions. One file per endpoint. Each handler calls into its feature module's scraper. |
| **Features** | `src/search/`, `src/model/`, `src/health/` | Each feature has `scraper.ts` (upstream HTTP + HTML parsing), `schemas.ts` (Zod schemas), `types.ts` (TS interfaces), `index.ts` (barrel). |
| **Shared infra** | `src/lib/fetch.ts`, `src/lib/cache.ts`, `src/errors.ts` | `fetchWithRetry` (network-level retries), `withCache` (Cloudflare Cache API wrapper), error classes (`UpstreamError`, `ParseError`). |
| **Entry** | `src/index.ts` | Creates `OpenAPIHono` app, mounts routes with cache middleware, exports `fetch` handler for Wrangler. |

**Data flow per request:**

```
Client → Hono router → withCache(cacheKey) → [cache hit?] → return cached
                                              [cache miss] → route handler
                                                → scraper (fetchWithRetry → ollama.com)
                                                → node-html-parser → CSS selectors
                                                → typed response / structured error
                                              → cache.put → return
```

**Scrapers** are the core abstraction. Two scrapers exist:

- `search/scraper.ts` — fetches `ollama.com/search?q=…&page=N`, parses
  model card links via `a.group.w-full` selector.
- `model/scraper.ts` — fetches `ollama.com/{model}/tags`, parses tag
  links via `a[href^="/"][href*=":"]` selector.

Both throw `ParseError` when selectors match zero elements (indicating
ollama.com changed its HTML) or `UpstreamError` on non-2xx responses.
These error classes drive the health check failure classification.

**Caching** uses Cloudflare's `caches.default` API:
- `/search` — 60s TTL
- `/model` — 300s TTL
- `/health` — uncached

**Error handling** is structured: all error responses use `ErrorResponseSchema`
with machine-readable `code` (enum), `message`, and optional `detail`.

### 3. Alerts Worker (workers/alerts/)

A separate Cloudflare **Tail Worker** that receives real-time execution
events from the API Worker via Cloudflare's tail consumer mechanism.
On any non-`ok` outcome, it sends an email alert via Cloudflare Email
Service (`env.EMAIL.send`).

**Data flow:** API Worker execution → Cloudflare Tail pipeline →
Alerts Worker `tail(events, env)` → Cloudflare Email API → inbox.

Configured via `[[tail_consumers]]` in `api/wrangler.toml`.

### 4. Docs Site (docs/)

Astro Starlight documentation site deployed to Cloudflare Pages.
Includes a **Pages Function** (`functions/api/[[path]].ts`) that proxies
`/api/*` requests to the Workers API, enabling the unified domain
`ollama.devcomfort.me` to serve both docs and API.

### 5. CI/CD Pipelines (.github/workflows/)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to main | Type-check + test API, TS client, Python client. Ensures schema sync across all three layers. |
| `deploy.yml` | push to main (api/packages/docs/workers paths) | Staging-first deploy: staging → verify → production → E2E → publish clients + docs. |
| `health-monitor.yml` | cron every 5 min | Probes `/health`, triggers auto-heal on 3 consecutive `structure_change` failures. |
| `auto-heal.yml` | dispatched by health-monitor | Uses OpenCode AI to inspect ollama.com HTML and patch scraper selectors. Opens PR with `auto-heal` label. Escalates to `needs-human` issue after 3 failed attempts. |
| `publish-npm.yml` | `ts-v*` tag push | Tests, builds, smoke-tests, publishes TS client to npm. |
| `publish-pypi.yml` | `py-v*` tag push | Tests, builds, smoke-tests, publishes Python client to TestPyPI then PyPI (OIDC Trusted Publisher). |

## Entry Points

| Entry Point | Type | Description |
|-------------|------|-------------|
| `api/src/index.ts` | Cloudflare Worker | Main API. Exports `default { fetch: app.fetch }` for Wrangler. |
| `workers/alerts/index.js` | Cloudflare Tail Worker | Exports `default { tail() }` for email alerts. |
| `docs/functions/api/[[path]].ts` | Cloudflare Pages Function | Proxies `/api/*` to Workers API. |
| `packages/ts-client/src/index.ts` | npm package | Re-exports `OllamaModelsClient` and types. |
| `packages/py-client/src/ollama_models/__init__.py` | PyPI package | Re-exports `OllamaModelsClient` and types. |
| `scripts/e2e.sh` | Shell script | E2E test suite against deployed API. |
| `scripts/smoke-ts-client.sh` | Shell script | Post-build smoke test for TS client artifact. |

## Key Abstractions

| Abstraction | Location | Purpose |
|-------------|----------|---------|
| `scrapeSearchPage()` | `api/src/search/scraper.ts` | Fetches + parses one search results page from ollama.com. |
| `scrapeModelPage()` | `api/src/model/scraper.ts` | Fetches + parses a model's `/tags` page from ollama.com. |
| `runHealthCheck()` | `api/src/health/check.ts` | Probes both scrapers with stable inputs, classifies failures. |
| `fetchWithRetry()` | `api/src/lib/fetch.ts` | Network-level retry wrapper (2 retries, 1s delay). |
| `withCache()` | `api/src/lib/cache.ts` | Cloudflare Cache API middleware (per-route TTL). |
| `UpstreamError` / `ParseError` | `api/src/errors.ts` | Error taxonomy: HTTP failures vs. HTML structure changes. |
| `OllamaModelsClient` | Both clients | Typed HTTP wrapper over the three API endpoints. |

## Design Decisions

- **Scrapers are the single source of truth.** Types, schemas, and client
  interfaces all derive from what the scrapers produce. When ollama.com
  changes, only scraper selectors need updating.
- **Zod-first schema design.** API schemas are Zod objects with `.openapi()`
  annotations. The OpenAPI spec is auto-generated from these schemas.
  Client types are manually maintained mirrors (not code-generated).
- **Staging-first deployment.** Every deploy goes staging → verify →
  production. Production never receives untested code.
- **Auto-heal loop.** The health monitor → auto-heal → human review
  pipeline handles the primary failure mode (ollama.com HTML changes)
  without manual intervention for up to 3 attempts.
