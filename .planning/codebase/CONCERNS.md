# CONCERNS.md — Technical Debt, Known Issues, and Risks

## High Risk: CSS Selector Fragility

**Location**: `api/src/search/scraper.ts`, `api/src/model/scraper.ts`

The entire scraping layer depends on CSS selectors that are hardcoded against Ollama's current HTML structure:

| Selector | File | What breaks if it changes |
|---|---|---|
| `a.group.w-full` | `search/scraper.ts` | Search returns nothing; API throws 500 |
| `a[class*="flex flex-col"]` | `model/scraper.ts` | Tag fetches fail; API throws 500 |

Ollama has no obligation to maintain these selectors. A frontend redesign would silently break all functionality. The hourly health check and alert webhook mitigate detection time but not prevention.

**Mitigation in place**: `assert(pages.length > 0, "selector ... may no longer match")` — fast-fail with a descriptive error message rather than returning empty data silently.

**Gap**: No automated monitoring that would differentiate "zero models matching a keyword" from "selector broke". A zero-result health probe could mask a selector regression.

## Medium Risk: No Rate Limiting or Backoff

**Location**: `api/src/search/search.ts`, `api/src/model/scraper.ts`

`search()` fetches multiple pages concurrently via `Promise.allSettled()` with no delay between requests. If users request large page ranges, this generates a burst of parallel fetches to `ollama.com`.

- No retry delay/backoff on the scraper level
- `maxRetries` parameter exists in `search()` but retries immediately (no sleep)
- Cloudflare Cache API reduces repeat requests, but cache is per-Worker-instance (not globally distributed in dev)

**Risk**: Potential rate-limiting or IP blocking by `ollama.com` under heavy usage.

## Medium Risk: Account ID Exposed in wrangler.toml

**Location**: `api/wrangler.toml` line `account_id = "8e04cab5daaf42d690fce67e4dca6d78"`

The Cloudflare account ID is committed to the repository. While not a secret (it cannot be used to authenticate), it is generally considered bad practice to expose account IDs in public repositories.

## Low Risk: Type Duplication Across Packages

Types are defined in three places with no single source of truth:
- `api/src/search/types.ts` + `api/src/model/types.ts`
- `packages/ts-client/src/types.ts` (manual mirror)
- `packages/py-client/src/ollama_models/types.py` (manual mirror)

If the API response shape changes, all three must be updated manually. There is no code generation step or shared schema (e.g. JSON Schema, OpenAPI, Zod) that would keep them in sync.

**Known open issue**: `TODO.md` notes consideration of automatic OpenAPI spec generation ("OpenAPI 명세를 자동으로 작성할 수 있어야하는데, 이게 가능한지/불가능한지 먼저 고려해야해").

## Low Risk: Python 3.8 Compatibility Constraints

**Location**: `packages/py-client/`

The package targets Python 3.8+, requiring:
- `from __future__ import annotations` at the top of every file (for deferred evaluation)
- `Optional[str]` instead of `str | None`
- `Union[...]` instead of `X | Y` union types

Python 3.8 reached end-of-life in October 2024. Continuing to support it restricts the use of modern Python syntax and type features.

## Low Risk: No Input Sanitization for `name` in GET /model

**Location**: `api/src/index.ts` — `GET /model` handler

The `name` parameter is normalized with string replace but not fully validated:
```typescript
const path = name
  .replace(/^(?:https?:\/\/ollama\.com)?\/+/, '')
  .replace(/\/tags\/?$/, '');
```

A path like `../../etc/passwd` or unusual characters could reach the `fetch()` call. The scraper only fetches from `https://ollama.com/${path}/tags`, so the blast radius is limited to SSRF against `ollama.com` paths — not arbitrary hosts — but the path normalization is not thorough.

## Low Risk: pnpm Workspace Does Not Include py-client

`pnpm-workspace.yaml` only includes `api/` and `packages/ts-client/`. The Python client is managed entirely through separate `rye` commands (`pnpm py:sync`, `pnpm py:build`, `pnpm py:publish`). This means `pnpm -r` commands never touch the Python package, which could lead to drift or oversight in CI workflows.

## Low Risk: No CI/CD Configuration Present

No `.github/workflows/`, no CI pipeline, no automated deployment config is present in the repository. Deployment and publishing are manual:
- `pnpm deploy` → Cloudflare Workers
- `pnpm ts:publish` → NPM
- `pnpm py:publish` → PyPI

Risk: regressions not caught automatically before publish.

## Low Risk: pnpm Monorepo Workspace Visibility

The `pnpm-workspace.yaml` does not include `packages/py-client/`, so `packages/py-client/` effectively lives as a standalone package within the monorepo. There is no automated way to run Python tests from the root `pnpm test` equivalent — it requires a separate `pnpm test:py` invocation or `rye run pytest` directly.
