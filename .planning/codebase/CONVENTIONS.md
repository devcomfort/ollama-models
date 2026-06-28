# Conventions

> Auto-generated 2026-06-27 from source analysis of the `ollama-models` monorepo.

## Monorepo Layout

```
pnpm-workspace.yaml   # packages: api, packages/*, docs
nx.json               # task runner (build, test, type-check, dev)
package.json          # root scripts delegating to nx
```

| Workspace | Runtime | Language | Package Manager |
|---|---|---|---|
| `api/` | Cloudflare Workers | TypeScript (ES2022) | pnpm |
| `packages/ts-client/` | Node.js / Browser | TypeScript (ES2022) | pnpm |
| `packages/py-client/` | CPython ≥ 3.8 | Python | rye / pip |
| `docs/` | Astro (static site) | TypeScript | pnpm |
| `workers/alerts/` | Cloudflare Workers | JavaScript (ESM) | — |

## TypeScript (api/ and packages/ts-client/)

### Language & Compiler

- **Target**: ES2022, `moduleResolution: "bundler"`, strict mode enabled.
- **No emit**: TypeScript is for type-checking only; bundling is done by wrangler (api) or tsdown (ts-client).
- **`import type`** used for all type-only imports. Enforced by convention (no lint rule observed, but consistently applied).

### Naming

| Construct | Convention | Example |
|---|---|---|
| Constants | `SCREAMING_SNAKE_CASE` | `SEARCH_TTL`, `MODEL_TTL`, `DEFAULT_BASE_URL`, `PROBE_KEYWORD`, `ErrorCodes` |
| Functions | `camelCase` | `scrapeSearchPage`, `fetchWithRetry`, `runHealthCheck` |
| Variables | `camelCase` | `searchUrl`, `maxRetries`, `lastErr` |
| Interfaces / Types | `PascalCase` | `ModelPage`, `SearchResult`, `Bindings` |
| Classes | `PascalCase` | `OllamaModelsClient`, `UpstreamError`, `ParseError` |
| Zod schemas | `PascalCase` + `Schema` suffix | `ModelPageSchema`, `SearchQuerySchema`, `ErrorResponseSchema` |
| Files (feature modules) | `camelCase` | `scraper.ts`, `handler.ts`, `check.ts`, `cache.ts` |
| Test files | `*.test.ts` | `search.test.ts`, `client.test.ts`, `fetch.test.ts` |

### Module Organization

Each feature follows a consistent internal structure:

```
feature/
  index.ts      # barrel — re-exports schemas, types, and business logic
  schemas.ts    # Zod schemas with .openapi() annotations
  types.ts      # TypeScript interfaces (inferred from Zod or hand-written)
  scraper.ts    # HTML fetching + parsing (scrapers only)
  handler.ts    # orchestration logic (search handler)
```

The top-level `api/src/schemas.ts` re-exports all feature schemas for backward compatibility. Feature `index.ts` barrels export schemas and business functions. Types use `import type` for cross-module references.

### Documentation

- **TSDoc** on every exported function, class, and interface.
- Required tags: summary, `@param`, `@returns`, `@throws`, `@example`.
- **Bilingual comments** (English + Korean) on public-facing schema properties and major code blocks. Korean translations follow the English line.
- Section dividers inside files use `// === Section Name ===` comment headers.

### Error Handling

Two custom error classes in `api/src/errors.ts`:

| Class | When Thrown | HTTP Status |
|---|---|---|
| `UpstreamError` | ollama.com returns non-2xx | 502 (`SCRAPE_UPSTREAM_ERROR`) |
| `ParseError` | CSS selector matches zero elements | 502 (`SCRAPE_PARSE_ERROR`) |

Route handlers (`searchHandler`, `modelHandler`, `healthHandler`) catch errors and return structured `ErrorResponse` JSON:

```json
{ "error": { "code": "SCRAPE_PARSE_ERROR", "message": "...", "detail": "..." } }
```

Error codes are centralized in `ErrorCodes` const object (`api/src/schemas.ts`). Error classification for health checks uses `classify()` to map error types to `FailureKind` enum values.

### Configuration

- **No `constants.ts`** — all runtime config lives in `wrangler.toml` `[vars]` and is passed as `env` parameter.
- Every function that needs config accepts an `env: Env` interface parameter. The `Env` interface is re-declared locally in each module (not shared) to keep dependencies minimal.
- The four env vars: `OLLAMA_BASE`, `OLLAMA_USER_AGENT`, `OLLAMA_ACCEPT`, `OLLAMA_ACCEPT_LANGUAGE`.

### API Design (Hono + @hono/zod-openapi)

- Routes defined with `createRoute()` — each route specifies method, path, request schema, response schemas per status code, summary, description, and tags.
- Handlers are `async (c: any) => ...` functions (the `any` cast is necessary due to Hono type generic erosion through `withCache` middleware).
- Validation is automatic via Zod schemas attached to `request.query`.
- CORS enabled globally via `app.use('*', cors())`.
- OpenAPI doc served at `/openapi.json`.

### Caching

- `withCache(ttl, handler)` wraps handlers with Cloudflare `caches.default` Cache API.
- Cache-Control: `public, max-age={ttl}`.
- TTLs: `/search` = 60s, `/model` = 300s, `/health` = not cached.

### Lint Suppressions

- `// eslint-disable-next-line @typescript-eslint/no-explicit-any` used on `defaultHook` and `withCache` handler type signatures. These are structural limitations of Hono's type system, not laziness.

### Build & Packaging (ts-client)

- Built with `tsdown` → CJS (`.cjs`) + ESM (`.mjs`) + DTS (`.d.cts`).
- Single runtime dependency: `es-toolkit` (used for `assert` utility in schema validation).
- Exports: `OllamaModelsClient` (class), `assertModelPage`, `assertSearchResult`, `assertModelTags`, `assertCheckResult`, `assertHealthStatus` (runtime validators), and all types.
- Client-side schemas use hand-written `assert*` functions (not Zod) to validate API responses at runtime — keeps the client dependency-free except for `es-toolkit`.

### Client API Pattern (ts-client)

```typescript
const client = new OllamaModelsClient();        // uses DEFAULT_BASE_URL
const client = new OllamaModelsClient('https://custom.api');  // self-hosted

const { pages } = await client.search('qwen3', 1);
const { tags } = await client.getModel('library/qwen3');
const status = await client.health();
```

## Python (packages/py-client/)

### Language & Compatibility

- **Python ≥ 3.8** (`requires-python = ">= 3.8"`).
- `from __future__ import annotations` in every module for PEP 604 style annotations.
- `Optional[str]` for nullable fields (not `str | None` — 3.8 compatibility).

### Data Modeling

- All data types are `@dataclass` — no Pydantic, no attrs.
- Fields use `List[str]`, `Optional[str]`, `Union[int, PageRangeDetail]` (typing module, not builtins).

### Naming

| Construct | Convention | Example |
|---|---|---|
| Classes | `PascalCase` | `OllamaModelsClient`, `ModelPage`, `SearchResult` |
| Functions | `snake_case` | `search`, `search_async`, `get_model`, `get_model_async` |
| Private functions | `_snake_case` | `_parse_search_result`, `_parse_model_tags` |
| Constants | `UPPER_SNAKE_CASE` | `DEFAULT_BASE_URL` |
| Variables | `snake_case` | `base_url`, `page_range`, `default_tag` |

### Client API Pattern

Sync + async paired methods:

```python
client = OllamaModelsClient()  # uses DEFAULT_BASE_URL
result = client.search("qwen3", page=1)           # sync
result = await client.search_async("qwen3", page=1)  # async

model = client.get_model("library/qwen3")
model = await client.get_model_async("library/qwen3")

status = client.health()
status = await client.health_async()
```

- Sync methods use `httpx.Client`.
- Async methods use `httpx.AsyncClient`.
- `base_url` trailing slashes stripped in `__init__`.

### Response Parsing

Wire JSON is deserialized via private `_parse_*` functions (not a generic schema library). The Python client flattens the `checks` wrapper from the `/health` response so callers write `status.search.ok` instead of `status.checks["search"].ok`.

### Package Build

- Build backend: `hatchling`.
- Managed by `rye` (`[tool.rye] managed = true`).
- Wheel packages `src/ollama_models/`.

### Exports

```python
from ollama_models import OllamaModelsClient, SearchResult, ModelPage, ModelTags, CheckResult, HealthStatus
```

## JavaScript (workers/alerts/)

- Plain ESM JavaScript (no TypeScript, no build step).
- Tail Worker receives execution events from the API Worker via `wrangler` `tail_consumers` config.
- Sends email alerts via Cloudflare Email Service binding for non-`ok` outcomes.
- Silently swallows email send failures (best-effort alerting).

## Git & CI Conventions

### Branch Strategy

- Default branch: `main`.
- Tag-triggered publishing: `ts-v*` for npm, `py-v*` for PyPI.

### CI Pipeline (`.github/workflows/ci.yml`)

Three sequential jobs on every push/PR to `main`:

1. **api** — type-check + unit tests.
2. **ts-client** — type-check + unit + integration tests (depends on api).
3. **py-client** — unit tests + integration tests against ci-server.ts subprocess (depends on api).

### Deploy Pipeline (`.github/workflows/deploy.yml`)

Six stages: deploy-staging → verify-staging → deploy-production → e2e → deploy-ts-client → deploy-docs.

### Health Monitoring

- `health-monitor.yml`: cron every 5 minutes, probes `/health`, triggers auto-heal on 3 consecutive `structure_change` failures.
- `auto-heal.yml`: uses OpenCode to patch CSS selectors in scrapers, opens PR with `auto-heal` label. Escalates to `needs-human` issue after 3 failed attempts in 24h.

### README Lint

`pnpm test:lint-readme` checks that README files don't reference stale schema names (`default_model_id`, `model_list`, `ModelWeight`).
