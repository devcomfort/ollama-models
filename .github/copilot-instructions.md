## Project

**ollama-models**

`ollama-models`는 공식 API가 없는 `ollama.com`을 스크래핑하여 모델 검색 및 태그 목록 조회 기능을 JSON HTTP API로 제공하는 Cloudflare Workers 백엔드와, 이를 감싸는 TypeScript·Python 클라이언트 SDK 모노레포다. 개발자가 Ollama 모델 레지스트리 데이터를 프로그래매틱하게 조회할 수 있게 한다.

### Constraints

- **Tech Stack**: Cloudflare Workers + Hono
- **Compatibility**: Python 3.8+ 지원 유지
- **Compatibility**: 기존 `@devcomfort/ollama-models` NPM 패키지 공개 API 하위 호환
- **Dependency**: `ollama.com` HTML 구조 변경 시 스크래퍼 선택자 수동 업데이트 필요
- **Security**: `wrangler.toml`에 노출된 `account_id` — CI 시크릿으로 이동 고려

## Technology Stack

## Languages

| Language   | Version | Location                      |
| ---------- | ------- | ----------------------------- |
| TypeScript | ^5.0.0  | `api/`, `packages/ts-client/` |
| Python     | >= 3.8  | `packages/py-client/`         |

## Runtimes / Deployment Targets

| Target             | Tool                   | Details                  |
| ------------------ | ---------------------- | ------------------------ |
| Cloudflare Workers | wrangler ^4.0.0        | `api/` — primary backend |
| Node.js (tests)    | vitest node env        | Unit test execution      |
| PyPI package       | hatchling + rye        | `packages/py-client/`    |
| NPM package        | tsup (ESM + CJS + DTS) | `packages/ts-client/`    |

## Package Managers

- **pnpm** (workspace-level) — `pnpm-workspace.yaml` defines two members: `api/` and `packages/ts-client/`
- **rye** — Python dependency management for `packages/py-client/`
- Monorepo root `package.json` has cross-package `pnpm -r run` scripts

## Frameworks / Libraries

### API (`api/`)

| Package                     | Version | Purpose                                                           |
| --------------------------- | ------- | ----------------------------------------------------------------- |
| `hono`                      | ^4.0.0  | HTTP routing framework for Cloudflare Workers                     |
| `node-html-parser`          | ^7.1.0  | HTML scraping without DOM environment                             |
| `es-toolkit`                | ^1.45.1 | Utility lib (`assert` from `es-toolkit/util`)                     |
| `@cloudflare/workers-types` | ^4.0.0  | TypeScript types for Workers globals (`caches`, `ScheduledEvent`) |

### TypeScript Client (`packages/ts-client/`)

| Package      | Version | Purpose                                        |
| ------------ | ------- | ---------------------------------------------- |
| `es-toolkit` | ^1.45.1 | `assert` utility for runtime schema validation |
| `tsup`       | ^8.0.0  | Bundler — produces CJS + ESM + `.d.ts`         |

### Python Client (`packages/py-client/`)

| Package          | Version  | Purpose                                         |
| ---------------- | -------- | ----------------------------------------------- |
| `httpx`          | >=0.27.0 | Async-capable HTTP client (sync and async APIs) |
| `pytest`         | >=8.0.0  | Test runner                                     |
| `pytest-asyncio` | >=0.23.0 | Async test support                              |
| `pytest-httpx`   | >=0.21.0 | `httpx` mock/intercept in tests                 |
| `build`          | >=1.0.0  | PEP 517 build frontend                          |

## Build / Bundle

- **API**: `wrangler dev` (local) / `wrangler deploy` (production); TypeScript transpiled by Wrangler at deploy time
- **TS Client**: `tsup` — entry `src/index.ts` → `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts` (types)
- **Py Client**: `rye run python -m build` → wheel via hatchling

## Configuration Files

| File                                  | Purpose                                                               |
| ------------------------------------- | --------------------------------------------------------------------- |
| `api/wrangler.toml`                   | Cloudflare Worker name, entry point, compatibility date, cron trigger |
| `api/tsconfig.json`                   | TypeScript settings for Workers (no `dom` lib)                        |
| `api/vitest.config.ts`                | Node env, setup file for Cache API stub                               |
| `packages/ts-client/tsconfig.json`    | TypeScript settings for library                                       |
| `packages/ts-client/vitest.config.ts` | Node env for TS client tests                                          |
| `packages/ts-client/tsup.config.ts`   | Bundle config (ESM+CJS+DTS, sourcemap)                                |
| `packages/py-client/pyproject.toml`   | Python project, rye config, pytest options                            |
| `pnpm-workspace.yaml`                 | pnpm monorepo workspace definition                                    |

## Deployment

- **API**: Hosted at `ollama-models-api.devcomfort.workers.dev` (Cloudflare Workers)
- **Cron trigger**: `0 * * * *` — health check every hour, optional Slack/Discord webhook alert
- **TS package**: Published to NPM as `@devcomfort/ollama-models`
- **Py package**: Published to PyPI as `ollama-models` via `twine upload`

## Conventions

## TypeScript Style

### General

- **Strict mode** TypeScript throughout (`tsconfig.json` in each package)
- `import type` used for type-only imports (e.g. `import type { SearchResult } from './types'`)
- Prefer `const` over `let`; no `var`
- All public functions and interfaces documented with TSDoc (summary + `@param` + `@returns` + `@throws` + `@example`)
- Fields in interfaces documented with inline `/** ... */` JSDoc

### Naming

| Kind                 | Convention                | Example                                           |
| -------------------- | ------------------------- | ------------------------------------------------- |
| Functions            | camelCase                 | `scrapeSearchPage`, `withCache`, `runHealthCheck` |
| Classes              | PascalCase                | `OllamaModelsClient`                              |
| Interfaces / Types   | PascalCase                | `ModelPage`, `SearchResult`, `ModelTags`          |
| Constants            | SCREAMING_SNAKE_CASE      | `OLLAMA_BASE`, `FETCH_HEADERS`, `SEARCH_TTL`      |
| Variables            | camelCase                 | `cacheKey`, `fresh`, `pages`                      |
| Private class fields | `private readonly` prefix | `private readonly baseUrl: string`                |
| Test helpers         | camelCase                 | `mockFetch`                                       |

### TSDoc Patterns

- Summary line: one concise sentence
- `@param` — each named parameter, skip if self-evident from type
- `@returns` — describes shape/type of return with cross-references (`{@link Type}`)
- `@throws` — every thrown error, including `assert` violations
- `@example` — always present for exported functions; shows realistic usage
- No `@remarks` tag (per user preference)
- No type repetition in comments (type shown by IDE)

### Error Handling

- `assert(condition, message)` from `es-toolkit/util` used for post-parse assertions (scraper integrity checks)
- Assert messages include the CSS selector and a human-readable explanation of what likely changed
- Route handlers catch all thrown errors with try/catch → `c.json({ error: String(err) }, 500)`
- Alert webhook calls are fire-and-forget — failure is silently swallowed with a `try/catch` containing no body
- Never rethrow from alert functions (they must not interfere with caller error handling)

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

## Architecture

## Cache Strategy

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

- Probes `scrapeSearchPage(1, "qwen")` with keyword `"qwen"`
- Probes `scrapeModelPage({ http_url: "https://ollama.com/library/qwen3", ... })`
- Returns structured `HealthStatus` with per-check `ok`, `count`, and `error` fields
- `GET /health` also calls `runHealthCheck()` live (no caching)
- On failure: POSTs detailed Slack-compatible mrkdwn alert to `ALERT_WEBHOOK_URL`

## Naming Conventions for Model IDs

- `library/{name}` — official Ollama-maintained models (e.g. `library/qwen3`)
- `{username}/{name}` — community models (e.g. `alibayram/smollm3`)
- Tags are pull-ready: `library/` prefix stripped for official models (e.g. `qwen3:latest`), kept for community models (e.g. `RogerBen/custom-model:v1`)

## Testing Strategy

### Test Layering

| Layer | Scope | Environment | Count |
|---|---|---|---|
| Unit | Individual functions / modules | Node.js (Vitest) | 72 |
| Integration | Full request/response chain | Node.js (in-process Hono or subprocess) | 39 |
| E2E | Deployed live API | Production URL | 23 |

### Harmful Mock Anti-Pattern

**Never** reimplement route handlers, middleware, or validation logic in a mock server for integration tests. This creates a parallel code path that drifts from production and gives false confidence.

**Correct approach**: Import the actual production `app` and serve it under Node.js via `@hono/node-server`. Stub only external dependencies at the lowest possible layer:
- `fetch()` calls to third-party APIs (e.g. ollama.com) — cache responses in memory
- Cloudflare Workers-only globals (e.g. `caches`) — no-op stubs

All route handlers, middleware (`withCache`, `cors`), Zod validation, error handling, and alert logic must run exactly as in production.

**Example**: `api/scripts/ci-server.ts` imports `app` from `api/src/index.ts` and intercepts only `fetch()` calls to `ollama.com`. The production error response format, cache headers, and CORS behavior are all exercised.
