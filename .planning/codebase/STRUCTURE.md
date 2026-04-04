# STRUCTURE.md — Directory Layout and Organization

## Top-Level Layout

```
ollama-models/
├── api/                    ← Cloudflare Workers backend (private)
├── packages/
│   ├── ts-client/          ← Published NPM package (@devcomfort/ollama-models)
│   └── py-client/          ← Published PyPI package (ollama-models)
├── package.json            ← Monorepo root scripts (pnpm -r)
├── pnpm-workspace.yaml     ← Defines workspace members: api/, packages/ts-client/
├── pnpm-lock.yaml
├── README.md
├── TODO.md                 ← One-liner open task note
└── LICENSE
```

## API Package (`api/`)

```
api/
├── wrangler.toml           ← Worker name, cron, secrets config
├── tsconfig.json           ← TypeScript for Workers (no DOM lib)
├── vitest.config.ts        ← Node env + Cache API stub setup
├── package.json
└── src/
    ├── index.ts            ← Hono app, all routes, cron handler, alert logic
    ├── constants.ts        ← OLLAMA_BASE, FETCH_HEADERS
    ├── search/
    │   ├── scraper.ts      ← scrapeSearchPage() — HTML parse → ModelPage[]
    │   ├── search.ts       ← search() — multi-page fetch coordinator
    │   └── types.ts        ← ModelPage, SearchResult, PageRange
    ├── model/
    │   ├── scraper.ts      ← scrapeModelPage() — HTML parse → ModelTags
    │   └── types.ts        ← ModelTags
    └── __tests__/
        ├── setup.ts        ← Global Cache API stub (for vitest Node env)
        ├── index.test.ts   ← Route handler tests (mocks scrapers)
        ├── search/
        │   ├── scraper.test.ts  ← scrapeSearchPage unit tests
        │   └── search.test.ts   ← search() multi-page/retry tests
        └── model/
            └── scraper.test.ts  ← scrapeModelPage unit tests
```

## TypeScript Client (`packages/ts-client/`)

```
packages/ts-client/
├── package.json            ← name: @devcomfort/ollama-models, exports CJS+ESM+DTS
├── tsconfig.json
├── tsup.config.ts          ← Bundle: entry src/index.ts → dist/
├── vitest.config.ts        ← Node env
└── src/
    ├── index.ts            ← Re-exports: OllamaModelsClient + all types + assertors
    ├── client.ts           ← OllamaModelsClient class
    ├── schemas.ts          ← Runtime assertors (assertModelPage, assertSearchResult, etc.)
    ├── types.ts            ← Mirror of API types (ModelPage, SearchResult, ModelTags, HealthStatus)
    └── __tests__/
        └── client.test.ts  ← OllamaModelsClient unit tests (mocks fetch)
```

## Python Client (`packages/py-client/`)

```
packages/py-client/
├── pyproject.toml          ← Python package config (rye + hatchling + pytest)
├── README.md
└── src/
    └── ollama_models/
        ├── __init__.py     ← Public exports: OllamaModelsClient + all types
        ├── client.py       ← OllamaModelsClient (sync + async), internal parsers
        └── types.py        ← Dataclass mirror of API types
    tests/
    ├── __init__.py
    ├── test_client.py      ← pytest tests using pytest-httpx
    └── test_types.py       ← Type construction tests
```

## Key File Locations

| What | Where |
|---|---|
| API entry point | `api/src/index.ts` |
| CORS + caching | `api/src/index.ts` (`withCache()`, `cors()`) |
| HTML selector constants | `api/src/search/scraper.ts`, `api/src/model/scraper.ts` (inline comments) |
| Shared HTTP headers | `api/src/constants.ts` (`FETCH_HEADERS`) |
| Ollama base URL | `api/src/constants.ts` (`OLLAMA_BASE`) |
| Default API URL | `packages/ts-client/src/client.ts` (`DEFAULT_BASE_URL`) |
| Default API URL (py) | `packages/py-client/src/ollama_models/client.py` (`DEFAULT_BASE_URL`) |
| Runtime type guards | `packages/ts-client/src/schemas.ts` |
| Cron trigger config | `api/wrangler.toml` |
| Root workspace scripts | `package.json` |

## Naming Conventions

- TypeScript files: camelCase (`scraper.ts`, `client.ts`, `types.ts`)
- Test files: `*.test.ts`, co-located under `src/__tests__/` mirroring the source structure
- Python files: snake_case (`client.py`, `types.py`, `test_client.py`)
- Exported class names: PascalCase (`OllamaModelsClient`)
- Exported type names: PascalCase (`ModelPage`, `SearchResult`, `ModelTags`)
- Internal helpers: camelCase functions, no classes (`scrapeSearchPage`, `withCache`, `runHealthCheck`)
