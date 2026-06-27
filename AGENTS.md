# AGENTS.md — Ollama Models

Instructions for AI agents working on the ollama-models project.

## Project Overview

`ollama-models` is a Cloudflare Workers API + TypeScript + Python client monorepo that scrapes `ollama.com` to provide model search and tag listing as a JSON HTTP API.

- **API**: Cloudflare Workers + Hono (`api/`)
- **TS Client**: `@devcomfort/ollama-models` (`packages/ts-client/`)
- **Python Client**: `ollama-models` (`packages/py-client/`)
- **Base URL**: `https://ollama.devcomfort.me/api`

## Tech Stack

| Layer | Tech |
|---|---|
| API runtime | Cloudflare Workers |
| API framework | Hono + `@hono/zod-openapi` |
| HTML scraping | `node-html-parser` |
| TS client build | `tsup` (ESM + CJS + DTS) |
| Python packaging | `hatchling` + `rye` |
| Test runner | Vitest (TS), pytest (Python) |

Hono is a lightweight, Workers-native framework. It works well for this project but has concrete tradeoffs: type generics erode through higher-order middleware (`any` suppressions in `defaultHook` and `withCache`), `createRoute()` is verbose per endpoint, and `@hono/zod-openapi` couples routing/validation/docs tightly. For structured APIs with many endpoints, Fastify or native Workers `fetch` handlers may be simpler.

## Testing Strategy

### Three-Layer Design

| Layer | Scope | Runner | Count |
|---|---|---|---|
| **Unit** | Functions / modules | Vitest (Node.js) | 72 |
| **Integration** | Full request/response chain | In-process Hono or subprocess | 39 |
| **E2E** | Deployed live API | Bash (`curl` + `python3`) | 23 |

### Golden Rule: No Harmful Mocks

**Never reimplement route handlers, middleware, or validation logic in a mock server.** This creates a parallel code path that silently drifts from production.

**Correct approach** — import the actual production `app` and serve it via `@hono/node-server`. Stub only external dependencies at the lowest layer:

- `fetch()` calls to third-party APIs (e.g. `ollama.com`) — cache responses in memory
- Cloudflare Workers-only globals (`caches`, `ScheduledEvent`) — no-op stubs

**Reference implementation**: `api/scripts/ci-server.ts` imports `app` from `api/src/index.ts`, intercepts `fetch()` to `ollama.com`, and serves the production app unchanged under Node.js.

**What NOT to do** (anti-pattern): `api/scripts/serve-for-ci.ts` — deleted because it reimplemented routes, skipped `withCache` middleware, bypassed `ErrorResponse` schema, and returned deterministic fixtures instead of exercising real scrapers.

### Test Commands

```bash
pnpm test              # All TypeScript tests (72)
pnpm test:api          # API only (44)
pnpm test:ts           # TS client only (28)
pnpm test:py           # Python tests (39, via rye run pytest)
./scripts/e2e.sh       # E2E against deployed API (23)
```

## Conventions

### TypeScript

- Strict mode, `import type` for type-only imports, no `var`
- TSDoc: summary + `@param` + `@returns` + `@throws` + `@example`
- Constants: `SCREAMING_SNAKE_CASE`
- Functions/variables: `camelCase`
- Classes/interfaces: `PascalCase`
- Error handling: scrapers throw `Error` with descriptive messages; route handlers catch and return structured `ErrorResponse`

### Python

- Python 3.8+ compatible, `from __future__ import annotations`
- `dataclass` for all data types
- Sync + async paired methods: `search()` / `search_async()`
- `Optional[str]` for nullable fields (not `str | None`)
- `httpx.Client` (sync), `httpx.AsyncClient` (async)

## Architecture

### Cache

| Endpoint | TTL |
|---|---|
| `/search` | 60s |
| `/model` | 300s |
| `/health` | **not cached** |

### Error Codes

- `INVALID_PARAMETER` — 400
- `SCRAPE_PARSE_ERROR` — 502
- `SCRAPE_UPSTREAM_ERROR` — 502
- `SCRAPE_NO_RESULTS` — 502
- `INTERNAL_ERROR` — 500

### Runtime Error Alerts

Tail Worker (`workers/alerts/`) receives real-time execution events from the API Worker via `tail_consumers`. Sends email alerts via Cloudflare Email Service for any non-`ok` outcome. Recipient configured via `ALERT_EMAIL_TO` secret.

### Config

All runtime configuration lives in `wrangler.toml` `[vars]`:
- `OLLAMA_BASE`
- `OLLAMA_USER_AGENT`
- `OLLAMA_ACCEPT`
- `OLLAMA_ACCEPT_LANGUAGE`

No `constants.ts` — deleted. All consumers read from `env` parameter.

## Directory Map

```
api/
  src/
    index.ts              # Hono app, routes, OpenAPI doc
    schemas.ts            # Centralized Zod schemas + ErrorCodes
    search/               # scraper.ts, search.ts, schemas.ts, types.ts
    model/                # scraper.ts, schemas.ts, types.ts
    health/               # check.ts, schemas.ts, types.ts
    __tests__/            # index.test.ts, search/, model/
  scripts/
    ci-server.ts          # Production app under Node.js (integration tests)
    gen-openapi.ts        # OpenAPI spec generator
  wrangler.toml           # Worker config + [vars]
packages/
  ts-client/            # NPM: @devcomfort/ollama-models
  py-client/            # PyPI: ollama-models
workers/
  alerts/               # Tail Worker: real-time error → email alerts
```
