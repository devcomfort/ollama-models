# Tech Stack

> Last updated: 2026-06-27

## Languages

| Language | Version | Usage |
|----------|---------|-------|
| TypeScript | 5.x | API worker, TS client, docs, build scripts |
| Python | 3.13.1 (`.python-version`); supports ≥3.8 | PyPI client library |
| JavaScript | ES2022 | Alerts Tail Worker (plain JS, no build step) |

## Runtime & Platform

| Component | Runtime | Host |
|-----------|---------|------|
| API | Cloudflare Workers (workerd, `compatibility_date: 2024-11-01`) | `ollama-models-api.devcomfort.workers.dev` |
| API (staging) | Cloudflare Workers | `ollama-models-api-staging.devcomfort.workers.dev` |
| Alerts Tail Worker | Cloudflare Workers | `ollama-models-alerts` (receives tail events from API) |
| Docs site | Cloudflare Pages (Astro static build) | `ollama.devcomfort.me` |
| CI/CD | GitHub Actions (ubuntu-latest, Node 22, Python 3.12) | GitHub |

## Frameworks & Libraries

### API (`api/`)

| Dependency | Purpose |
|------------|---------|
| Hono 4.x (`hono`) | Lightweight web framework for Cloudflare Workers |
| `@hono/zod-openapi` | OpenAPI route definitions with Zod schema validation |
| Zod 4.x | Runtime schema validation |
| `node-html-parser` | HTML parsing for scraping ollama.com |
| Wrangler 4.x | Cloudflare Workers CLI (dev, deploy, secrets) |
| Vitest 4.x | Unit/integration test runner |
| tsx | TypeScript execution for scripts (gen-openapi, ci-server) |

### TypeScript Client (`packages/ts-client/`)

| Dependency | Purpose |
|------------|---------|
| `es-toolkit` | Utility library (runtime dependency) |
| tsdown | Library bundler (CJS + ESM dual output) |
| Vitest 4.x | Test runner |
| TypeScript 5.x | Type checking |

### Python Client (`packages/py-client/`)

| Dependency | Purpose |
|------------|---------|
| `httpx` ≥0.27.0 | Sync/async HTTP client |
| Hatchling | PEP 517 build backend |
| pytest + pytest-asyncio + pytest-httpx | Testing |
| Playwright | E2E browser testing (dev dependency) |
| Rye | Python project management |

### Documentation (`docs/`)

| Dependency | Purpose |
|------------|---------|
| Astro 6.x | Static site generator |
| `@astrojs/starlight` | Documentation theme with i18n (English, Korean) |

## Monorepo Tooling

| Tool | Version | Config |
|------|---------|--------|
| pnpm | 10.22.0 | `pnpm-workspace.yaml` — workspaces: `api`, `packages/*`, `docs` |
| Nx | 23.x | `nx.json` — task graph, caching, affected commands |

## Build & Bundling

- **API**: Wrangler bundles `src/index.ts` → Cloudflare Worker
- **TS Client**: tsdown → `dist/index.cjs` + `dist/index.mjs` + `dist/index.d.cts`
- **Python Client**: Hatchling → wheel + sdist
- **Docs**: `astro build` → static HTML/CSS/JS

## Configuration Files

| File | Purpose |
|------|---------|
| `api/wrangler.toml` | Worker name, entrypoint, env vars, staging env, tail consumer |
| `api/.dev.vars` | Local dev secrets (Slack webhook URL) |
| `api/tsconfig.json` | ES2022 target, bundler module resolution, `@cloudflare/workers-types` |
| `packages/ts-client/tsconfig.json` | Client library TypeScript config |
| `packages/py-client/pyproject.toml` | Python project metadata, deps, build config |
| `docs/astro.config.mjs` | Astro site config, Starlight sidebar, i18n locales |
| `nx.json` | Nx workspace config with caching defaults |
| `.python-version` | Pins Python 3.13.1 for local dev |

## Testing Stack

| Layer | Framework | Strategy |
|-------|-----------|----------|
| API | Vitest 4.x | Unit tests with HTML fixtures; setup file at `src/__tests__/setup.ts` |
| TS Client | Vitest 4.x | Unit tests (mocked fetch) + integration tests (Hono app via `vi.stubGlobal`) |
| Python Client | pytest + pytest-httpx + pytest-asyncio | Unit tests (HTTPX mock) + integration tests (Node.js CI server subprocess) |
| E2E | Shell script (`scripts/e2e.sh`) | Full API endpoint verification against production |
| Smoke | Shell script (`scripts/smoke-ts-client.sh`) | Post-build artifact verification |

## CI/CD Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to main | API type-check + tests → TS client tests → Python client tests |
| `deploy.yml` | push to main (path-filtered) | Staging deploy → verify → production deploy → E2E → npm publish → docs deploy |
| `publish-npm.yml` | `ts-v*` tag push | Publish TS client to npm |
| `publish-pypi.yml` | `py-v*` tag push | Build → TestPyPI → PyPI (OIDC Trusted Publisher) |
| `health-monitor.yml` | cron every 5 min | Probe `/health`; triggers auto-heal on 3 consecutive `structure_change` failures |
| `auto-heal.yml` | dispatched by health-monitor | Uses OpenCode AI to patch CSS selectors and open PR |

## Package Publishing

| Package | Registry | Trigger |
|---------|----------|---------|
| `ollama-models` (TS) | npm | `ts-v*` git tag |
| `ollama-models` (Python) | PyPI (via TestPyPI) | `py-v*` git tag, OIDC auth |
