# CONCERNS.md — Technical Debt & Risk Inventory

> **Date**: 2026-06-27
> **Scope**: ollama-models monorepo (API, TS client, Python client, alerts worker, CI/CD)

---

## 1. Fragile Scrapers (Critical)

The entire value proposition depends on parsing `ollama.com` HTML. Both scrapers use CSS selectors against live HTML — any front-end change by Ollama breaks the API silently.

| Scraper | Selector | File | Risk |
|---|---|---|---|
| Search | `a.group.w-full` | `api/src/search/scraper.ts:63` | Tailwind class names are generated/minified in production builds; a refactor on ollama.com's side drops these classes without warning. |
| Model tags | `a[href^="/"][href*=":"]` | `api/src/model/scraper.ts:81` | More stable (attribute-based), but any navigation link with a colon in its href (e.g. protocol-relative URLs) would produce false positives. |

**Mitigation in place**: Health monitor (`health-monitor.yml`) probes every 5 minutes, triggers auto-heal after 3 consecutive `structure_change` failures. Auto-heal uses an LLM to patch selectors and open a PR.

**Remaining gap**: The health monitor only detects `structure_change` (zero matches). It does **not** detect **partial breakage** — e.g. ollama.com adds a new card type that the selector now also matches, injecting garbage into results. No schema-level validation of scraped content exists beyond "length > 0".

---

## 2. Type Safety Suppressions (Medium)

Multiple `// eslint-disable-next-line @typescript-eslint/no-explicit-any` suppressions exist across the codebase:

| Location | Reason |
|---|---|
| `api/src/index.ts:13` | `defaultHook` callback casts context to `any` |
| `api/src/lib/cache.ts:1-4` | `withCache` signature uses `any` for handler and return type |
| `api/src/routes/search.ts:41` | `searchHandler` parameter typed as `any` |
| `api/src/routes/model.ts:42` | `modelHandler` parameter typed as `any` |
| `api/src/routes/health.ts:29` | `healthHandler` parameter typed as `any` |

The root cause is Hono's type generics eroding through higher-order middleware. The `withCache` wrapper loses the `Bindings` context type, forcing every handler to accept `any`. This is a known Hono limitation — the AGENTS.md acknowledges it.

**Risk**: `c.env` access inside handlers is untyped. A typo in an env var name (e.g. `c.env.OLLAMA_BAES`) compiles silently and fails only at runtime on Cloudflare.

---

## 3. Cache Drains and Rewrites Responses (Medium)

`api/src/lib/cache.ts` uses Cloudflare's `caches.default` (Cache API). The `withCache` wrapper has a structural problem: it calls `await res.text()` to drain the response body, then constructs a **brand-new `Response`** with only two headers — `Content-Type: application/json` and `Cache-Control`. All original handler headers are discarded.

Consequences:

1. **Error responses are cached**: If ollama.com is down and the scraper throws, the error response gets cached for the full TTL (60s for search, 300s for model). Subsequent requests within the TTL window serve the stale error.

2. **Original headers silently dropped**: Any header the handler sets (e.g. `X-Request-Id`, `Vary`, CORS headers beyond the wildcard) is lost on the cached path. The `cors()` middleware runs *before* `withCache` wraps the handler, so CORS headers are set on the first response but stripped when it's reconstructed for caching. Works today because `cors()` sets `Access-Control-Allow-Origin: *` and the cache reconstruction doesn't need it, but any future header-dependent behavior breaks silently.

3. **`Content-Type` hardcoded**: Always `application/json` regardless of what the handler returned. Fragile if the API ever serves non-JSON.

4. **Streaming impossible**: The full body is buffered in memory via `res.text()`. Fine for small JSON payloads, but the pattern blocks any future streaming endpoint.
---

## 4. Overlapping Retry Semantics with Silent Error Swallowing (Medium)

Two retry layers exist with different and undocumented rules:

| Layer | File | What it retries | What it swallows |
|---|---|---|---|
| `fetchWithRetry` | `api/src/lib/fetch.ts` | Network-level `fetch()` throws (DNS, connection refused) | Nothing — non-2xx returned as-is |
| `search()` handler | `api/src/search/handler.ts:58-70` | Re-invokes `scrapeSearchPage` per page on any error | Silently skips permanently failed pages via `Promise.allSettled` |

The interaction is subtle: `fetchWithRetry` retries network errors internally (2 attempts), then if the scraper still fails (or gets a non-2xx), `search()`'s own loop retries the whole scraper call (default `maxRetries=0`, so no additional retries today). But the default of 0 means the `search()` retry loop is dead code in production — it only activates when a caller explicitly passes `maxRetries > 0`, which no route handler does.

The real problem is `Promise.allSettled` on line 58: failed pages are silently dropped. A consumer requesting pages 1–5 and getting back results from only pages 1, 3, 5 has no way to know pages 2 and 4 failed — the `page_range` in the response still says `{ from: 1, to: 5 }`. There is no `partial: true` flag, no `failed_pages` array, no warning header.

Additionally, `fetchWithRetry` uses a fixed 1-second delay with no exponential backoff. A 429 (rate limit) or 503 (temporary overload) from ollama.com is not retried at all — the scraper throws `UpstreamError`, which surfaces as a 502 to API consumers. For transient upstream issues, this is unnecessarily aggressive.

---

## 5. No Rate Limiting or Abuse Protection (Medium)

The API has no rate limiting. Since it proxies requests to `ollama.com` via scraping, a burst of API calls translates directly to a burst of HTTP requests to ollama.com. This risks:

- Getting the Workers IP range rate-limited or blocked by ollama.com.
- Amplifying a DDoS against ollama.com through the API.
- Cloudflare Workers free tier request limits being exhausted.

The `User-Agent` header identifies the API (`ollama-models-api/0.1`), which helps ollama.com identify the source, but provides no protection against the API itself being abused.

---

## 6. `Env` Interface Duplication (Low)

The `Env` interface (Cloudflare Workers bindings) is defined independently in multiple files:

| File | Fields |
|---|---|
| `api/src/types.ts` | `OLLAMA_BASE`, `OLLAMA_USER_AGENT`, `OLLAMA_ACCEPT`, `OLLAMA_ACCEPT_LANGUAGE` |
| `api/src/search/scraper.ts:6-11` | Same 4 fields |
| `api/src/model/scraper.ts:7-11` | 3 fields (missing `OLLAMA_BASE`) |
| `api/src/health/check.ts:7-12` | Same 4 fields |
| `api/src/search/handler.ts:6-11` | Same 4 fields |

These are structurally identical but not shared. If a new env var is added, every interface must be updated manually. The canonical `Bindings` type in `api/src/types.ts` exists but is only imported by route files, not scrapers.

---

## 7. Python Client: Python 3.8 Compatibility Constraint (Low)

`pyproject.toml` declares `requires-python = ">= 3.8"` and CI tests on 3.12 only. Python 3.8 reached EOL in October 2024. The `from __future__ import annotations` import defers annotation evaluation, but:

- `typing.Optional` and `typing.List` are used instead of modern `str | None` and `list[str]` syntax.
- No CI matrix testing on 3.8/3.9/3.10/3.11 — compatibility is assumed, not verified.
- `httpx>=0.27.0` dropped Python 3.8 support in httpx 0.28.0 (released 2025). The constraint `>=0.27.0` allows installing a version that won't work on 3.8.

---

## 8. CI Interceptor Patches `globalThis.fetch` (Low)

`api/src/testing/ci-interceptor.ts` replaces `globalThis.fetch` with a caching interceptor for integration tests. This is a global mutation that:

- Persists for the lifetime of the process (no cleanup/restore mechanism exposed).
- Could interfere with other test code that expects real `fetch` behavior.
- The `clearCache()` method clears the cache but doesn't restore the original `fetch`.

---

## 9. Health Check Probe Model is Hardcoded (Low)

`api/src/health/check.ts:34-38` hardcodes `qwen3` as the probe model and `qwen` as the search keyword. If `qwen3` is removed from ollama.com or renamed, the health check fails with a false positive `structure_change` — triggering the auto-heal pipeline unnecessarily.

The comment says "well-known probe target with a reliably large number of tags," but "reliably" is an assumption about ollama.com's content stability.

---

## 10. OpenAPI Spec Staleness (Low)

`api/openapi.json` (13KB, last modified 1 month ago) is a static file. It's generated by `api/scripts/gen-openapi.ts` but there's no CI check that it stays in sync with the running route definitions. The `deploy.yml` workflow excludes `api/openapi.json` from path triggers, so changes to routes don't force a spec regeneration.

---

## 11. No Request Timeouts on Scrapers (Low-Medium)

Neither scraper sets a timeout on the `fetchWithRetry` call. If ollama.com hangs (accepts the connection but never responds), the Worker will block until Cloudflare's default Worker CPU/time limit (30s for free plan). During this time, the request slot is consumed and the consumer gets a Worker timeout error rather than a structured API error.

---

## 12. Orphaned Secret in `api/.dev.vars` (Medium)

`api/.dev.vars` contains a plaintext Slack webhook URL:

```
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/[REDACTED]
```

Grepping the entire repo shows `ALERT_WEBHOOK_URL` is referenced **nowhere** — not in code, not in docs, not in CI. The actual alerts path uses `ALERT_EMAIL_TO` + the `EMAIL` send_email binding (`workers/alerts/index.js`). So `.dev.vars` holds a real-looking credential that is:

1. **Orphaned** — diverged from the documented alerts path (`AGENTS.md:99` documents email alerts, not Slack). Likely a leftover from an earlier iteration that was never cleaned up.
2. **Plaintext credential** — `.dev.vars` is gitignored (confirmed), but the webhook URL is a live Slack token. If the workspace is shared, backed up, or the gitignore is accidentally removed, the credential leaks. It should be rotated and the file cleaned.
---

## 13. Duplicated Type Definitions Across Packages (Low)

`PageRange`, `ModelPage`, `SearchResult`, `ModelTags`, `CheckResult`, `HealthStatus` are defined in three places:

1. `api/src/*/types.ts` — API-side (Zod-inferred or manual interfaces)
2. `packages/ts-client/src/types.ts` — TS client (manual interfaces)
3. `packages/py-client/src/ollama_models/types.py` — Python client (dataclasses)

These must stay in sync manually. The CI pipeline tests serialization/deserialization compatibility, but there's no single source of truth — a field rename in the API doesn't automatically propagate to clients.

---

## Summary by Severity

| Severity | Count | Items |
|---|---|---|
| **Critical** | 1 | Fragile scrapers (#1) |
| **Medium** | 5 | Type suppressions (#2), Cache rewrite (#3), Overlapping retries (#4), No rate limiting (#5), Orphaned secret (#12) |
| **Low-Medium** | 1 | No fetch timeouts (#11) |
| **Low** | 6 | Env duplication (#6), Python 3.8 (#7), CI interceptor (#8), Hardcoded probe (#9), OpenAPI staleness (#10), Type duplication (#13) |
