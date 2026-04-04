# STACK.md — Technology Stack

## Languages

| Language | Version | Location |
|---|---|---|
| TypeScript | ^5.0.0 | `api/`, `packages/ts-client/` |
| Python | >= 3.8 | `packages/py-client/` |

## Runtimes / Deployment Targets

| Target | Tool | Details |
|---|---|---|
| Cloudflare Workers | wrangler ^4.0.0 | `api/` — primary backend |
| Node.js (tests) | vitest node env | Unit test execution |
| PyPI package | hatchling + rye | `packages/py-client/` |
| NPM package | tsup (ESM + CJS + DTS) | `packages/ts-client/` |

## Package Managers

- **pnpm** (workspace-level) — `pnpm-workspace.yaml` defines two members: `api/` and `packages/ts-client/`
- **rye** — Python dependency management for `packages/py-client/`
- Monorepo root `package.json` has cross-package `pnpm -r run` scripts

## Frameworks / Libraries

### API (`api/`)

| Package | Version | Purpose |
|---|---|---|
| `hono` | ^4.0.0 | HTTP routing framework for Cloudflare Workers |
| `node-html-parser` | ^7.1.0 | HTML scraping without DOM environment |
| `es-toolkit` | ^1.45.1 | Utility lib (`assert` from `es-toolkit/util`) |
| `@cloudflare/workers-types` | ^4.0.0 | TypeScript types for Workers globals (`caches`, `ScheduledEvent`) |

### TypeScript Client (`packages/ts-client/`)

| Package | Version | Purpose |
|---|---|---|
| `es-toolkit` | ^1.45.1 | `assert` utility for runtime schema validation |
| `tsup` | ^8.0.0 | Bundler — produces CJS + ESM + `.d.ts` |

### Python Client (`packages/py-client/`)

| Package | Version | Purpose |
|---|---|---|
| `httpx` | >=0.27.0 | Async-capable HTTP client (sync and async APIs) |
| `pytest` | >=8.0.0 | Test runner |
| `pytest-asyncio` | >=0.23.0 | Async test support |
| `pytest-httpx` | >=0.21.0 | `httpx` mock/intercept in tests |
| `build` | >=1.0.0 | PEP 517 build frontend |

## Build / Bundle

- **API**: `wrangler dev` (local) / `wrangler deploy` (production); TypeScript transpiled by Wrangler at deploy time
- **TS Client**: `tsup` — entry `src/index.ts` → `dist/index.js` (CJS), `dist/index.mjs` (ESM), `dist/index.d.ts` (types)
- **Py Client**: `rye run python -m build` → wheel via hatchling

## Configuration Files

| File | Purpose |
|---|---|
| `api/wrangler.toml` | Cloudflare Worker name, entry point, compatibility date, cron trigger |
| `api/tsconfig.json` | TypeScript settings for Workers (no `dom` lib) |
| `api/vitest.config.ts` | Node env, setup file for Cache API stub |
| `packages/ts-client/tsconfig.json` | TypeScript settings for library |
| `packages/ts-client/vitest.config.ts` | Node env for TS client tests |
| `packages/ts-client/tsup.config.ts` | Bundle config (ESM+CJS+DTS, sourcemap) |
| `packages/py-client/pyproject.toml` | Python project, rye config, pytest options |
| `pnpm-workspace.yaml` | pnpm monorepo workspace definition |

## Deployment

- **API**: Hosted at `ollama-models-api.devcomfort.workers.dev` (Cloudflare Workers)
- **Cron trigger**: `0 * * * *` — health check every hour, optional Slack/Discord webhook alert
- **TS package**: Published to NPM as `@devcomfort/ollama-models`
- **Py package**: Published to PyPI as `ollama-models` via `twine upload`
