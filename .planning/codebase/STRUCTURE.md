# Directory Structure

**Date:** 2026-06-27

## Root Layout

```
ollama-models/
├── api/                    Cloudflare Workers API (Hono + Zod)
├── packages/
│   ├── ts-client/          TypeScript/JS SDK (npm: ollama-models)
│   └── py-client/          Python SDK (PyPI: ollama-models)
├── workers/
│   └── alerts/             Tail Worker for runtime error emails
├── docs/                   Astro Starlight documentation site
├── scripts/                CI/CD and operational scripts
├── .github/workflows/      GitHub Actions CI/CD pipelines
├── .planning/              Project planning artifacts (not deployed)
├── package.json            Root monorepo manifest (pnpm workspaces)
├── pnpm-workspace.yaml     Workspace definition: api, packages/*, docs
├── pnpm-lock.yaml          Lockfile
├── nx.json                 Nx task runner config (caching, targets)
└── .gitignore
```

## Monorepo Management

- **Package manager:** pnpm 10+ (workspaces)
- **Task runner:** Nx (build/test/type-check caching, dependency graph)
- **Workspace members:** `api`, `packages/ts-client`, `packages/py-client`, `docs`
- **Non-member:** `workers/alerts` (standalone Wrangler project, no npm deps)
- Each workspace member has a `project.json` defining Nx targets

## api/ — Cloudflare Workers API

```
api/
├── src/
│   ├── index.ts              Entry point: creates OpenAPIHono app, mounts routes
│   ├── types.ts              Bindings type (env vars)
│   ├── schemas.ts            Barrel: re-exports all feature schemas + ErrorCodes
│   ├── errors.ts             UpstreamError, ParseError classes
│   ├── routes/               HTTP route definitions (one per endpoint)
│   │   ├── search.ts         GET /search — route def + handler
│   │   ├── model.ts          GET /model — route def + handler
│   │   ├── health.ts         GET /health — route def + handler
│   │   └── openapi.ts        OpenAPI spec config
│   ├── search/               Search feature module
│   │   ├── scraper.ts        Scrapes ollama.com/search HTML
│   │   ├── handler.ts        Multi-page search orchestrator
│   │   ├── schemas.ts        Zod schemas (ModelPage, SearchQuery, SearchResult)
│   │   ├── types.ts          TS interfaces (ModelPage, SearchResult, PageRange)
│   │   └── index.ts          Barrel export
│   ├── model/                Model feature module
│   │   ├── scraper.ts        Scrapes ollama.com/{model}/tags HTML
│   │   ├── schemas.ts        Zod schemas (ModelQuery, ModelTags)
│   │   ├── types.ts          TS interface (ModelTags)
│   │   └── index.ts          Barrel export
│   ├── health/               Health check feature module
│   │   ├── check.ts          Probes both scrapers, classifies failures
│   │   ├── schemas.ts        Zod schemas (CheckResult, HealthStatus)
│   │   ├── types.ts          Inferred types from Zod schemas
│   │   └── index.ts          Barrel export
│   ├── lib/                  Shared infrastructure
│   │   ├── fetch.ts          fetchWithRetry (network-level retries)
│   │   └── cache.ts          withCache middleware (Cloudflare Cache API)
│   ├── testing/              Test utilities
│   │   └── ci-interceptor.ts Fetch interceptor for deterministic CI tests
│   └── __tests__/            Test files
│       ├── setup.ts          Vitest setup file
│       ├── shared-test-config.ts
│       ├── routes/           Route handler tests
│       ├── search/           Search scraper tests
│       ├── model/            Model scraper tests
│       ├── health/           Health check tests
│       ├── lib/              Lib utility tests
│       └── testing/          CI interceptor tests
├── scripts/
│   ├── gen-openapi.ts        Generates openapi.json from Zod schemas
│   └── ci-server.ts          Standalone Hono server for Python integration tests
├── openapi.json              Generated OpenAPI 3.0 spec
├── wrangler.toml             Wrangler config (prod + staging env)
├── package.json              Dependencies: hono, @hono/zod-openapi, zod, node-html-parser
├── project.json              Nx targets (dev, deploy, build, test, type-check, gen-openapi)
├── vitest.config.ts          Test config (setupFiles: setup.ts)
├── tsconfig.json             TypeScript config
└── .dev.vars                 Local development secrets
```

### Naming Conventions (api/)

- **Feature modules** (`search/`, `model/`, `health/`) each contain:
  - `scraper.ts` — upstream HTTP fetch + HTML parsing
  - `schemas.ts` — Zod schema definitions
  - `types.ts` — TypeScript interfaces (or Zod inferred types)
  - `index.ts` — barrel re-export
- **Routes** (`routes/`) mirror feature modules one-to-one. Each file
  exports a `*Route` (OpenAPI route definition) and `*Handler` (Hono handler).
- **Tests** mirror source structure under `__tests__/`: `routes/`,
  `search/`, `model/`, `health/`, `lib/`, `testing/`.
- **Schemas** use `*Schema` suffix (Zod objects). Types use PascalCase
  interfaces. Error classes use `*Error` suffix.

## packages/ts-client/ — TypeScript SDK

```
packages/ts-client/
├── src/
│   ├── index.ts              Barrel: exports OllamaModelsClient, types, assertions
│   ├── client.ts             OllamaModelsClient class (search, getModel, health)
│   ├── types.ts              TS interfaces (ModelPage, SearchResult, ModelTags, etc.)
│   ├── schemas.ts            Runtime assertion functions (assertModelPage, etc.)
│   └── __tests__/
│       ├── client.test.ts    Unit tests (mocked fetch)
│       └── integration.test.ts  Integration tests (routed through Hono app)
├── package.json              Published as "ollama-models" on npm
├── project.json              Nx targets (build, test, type-check, dev)
├── tsdown.config.ts          Build config (CJS + ESM output)
├── tsconfig.json
└── vitest.config.ts
```

### Naming Conventions (ts-client)

- Assertion functions: `assert*` prefix (`assertModelPage`, `assertSearchResult`)
- Types mirror API schemas with identical names (`ModelPage`, `SearchResult`, etc.)
- Dual CJS/ESM output: `dist/index.cjs`, `dist/index.mjs`, `dist/index.d.cts`

## packages/py-client/ — Python SDK

```
packages/py-client/
├── src/ollama_models/
│   ├── __init__.py           Barrel: exports OllamaModelsClient, types
│   ├── client.py             OllamaModelsClient class (sync + async variants)
│   └── types.py              @dataclass models (ModelPage, SearchResult, etc.)
├── tests/
│   ├── unit/
│   │   ├── test_client.py    Unit tests (pytest-httpx mocked transport)
│   │   └── test_types.py     Type/dataclass tests
│   └── integration/
│       └── test_integration.py  Integration tests (against ci-server.ts)
├── pyproject.toml            Published as "ollama-models" on PyPI
└── project.json              Nx targets (build, test, test:integration)
```

### Naming Conventions (py-client)

- Types are `@dataclass` classes, PascalCase (`ModelPage`, `SearchResult`)
- Sync methods: bare names (`search`, `get_model`, `health`)
- Async methods: `_async` suffix (`search_async`, `get_model_async`)
- Internal parsers: `_parse_*` prefix (underscore = module-private)
- `PageRange` is a `Union[int, PageRangeDetail]` type alias

## workers/alerts/ — Tail Worker

```
workers/alerts/
├── index.js                  Tail handler: event → email alert
├── wrangler.toml             Worker config (send_email binding)
└── project.json              Nx targets (deploy, dev)
```

Plain JavaScript (no build step). Receives tail events from the API
Worker and sends email via Cloudflare Email Service.

## docs/ — Documentation Site

```
docs/
├── src/
│   ├── content/docs/
│   │   ├── en/               English content (mdx)
│   │   └── ko/               Korean content (mdx)
│   ├── pages/
│   │   ├── index.astro       Landing page
│   │   └── try/index.astro   Interactive API demo
│   ├── content.config.ts     Astro content config
│   └── env.d.ts
├── functions/api/
│   └── [[path]].ts           Pages Function: proxies /api/* to Workers API
├── astro.config.mjs          Starlight config (bilingual: en, ko)
├── package.json
└── project.json              Nx targets (build, dev)
```

Content files are bilingual — each page exists in both `en/` and `ko/`
with identical filenames.

## scripts/ — Operational Scripts

```
scripts/
├── e2e.sh                    E2E test suite against deployed API (curl-based)
└── smoke-ts-client.sh        Post-build smoke test for TS client dist artifacts
```

- `e2e.sh` — validates `/health`, `/search`, `/model` plus error cases
  (400 validation, 502 scraper errors). Used in `deploy.yml` post-production.
- `smoke-ts-client.sh` — verifies CJS `require()`, ESM `import`, and
  `.d.cts` exports are intact. Used in `deploy.yml` and `publish-npm.yml`.

## .github/workflows/ — CI/CD Pipelines

```
.github/workflows/
├── ci.yml                    CI: type-check + test (api → ts-client, py-client)
├── deploy.yml                Staging-first deploy pipeline (7 stages)
├── health-monitor.yml        Cron: probes /health every 5 min
├── auto-heal.yml             AI-powered scraper selector patching
├── publish-npm.yml           Publish TS client on ts-v* tag
└── publish-pypi.yml          Publish Python client on py-v* tag (OIDC)
```

### Naming Conventions (workflows)

- Deploy tag pattern: `ts-v*` for npm, `py-v*` for PyPI
- Auto-heal labels: `auto-heal` (PRs), `needs-human` (escalation issues)
- Attempt tracking: `attempt-1`, `attempt-2`, `attempt-3` labels

## .planning/ — Project Artifacts

```
.planning/
└── codebase/                 Architecture and structure documentation
    ├── ARCHITECTURE.md
    └── STRUCTURE.md
```

Not deployed. Internal reference for contributors and AI agents.

## Key File Locations

| What | Where |
|------|-------|
| API entry point | `api/src/index.ts` |
| API schemas (barrel) | `api/src/schemas.ts` |
| Search scraper | `api/src/search/scraper.ts` |
| Model scraper | `api/src/model/scraper.ts` |
| Health check | `api/src/health/check.ts` |
| Error classes | `api/src/errors.ts` |
| Cache middleware | `api/src/lib/cache.ts` |
| Fetch retry | `api/src/lib/fetch.ts` |
| TS client class | `packages/ts-client/src/client.ts` |
| TS client types | `packages/ts-client/src/types.ts` |
| Python client class | `packages/py-client/src/ollama_models/client.py` |
| Python types | `packages/py-client/src/ollama_models/types.py` |
| Alerts worker | `workers/alerts/index.js` |
| Docs proxy | `docs/functions/api/[[path]].ts` |
| OpenAPI spec | `api/openapi.json` |
| Wrangler config | `api/wrangler.toml` |
| E2E tests | `scripts/e2e.sh` |
| CI pipeline | `.github/workflows/ci.yml` |
| Deploy pipeline | `.github/workflows/deploy.yml` |
