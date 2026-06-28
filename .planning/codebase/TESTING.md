# Testing


## Test Count Summary

| Layer | Scope | Runner | Count |
|---|---|---|---|
| Unit | Functions / modules | Vitest (Node.js) | 92 |
| Integration | Full request/response chain | In-process Hono or subprocess | 39 |
| E2E | Browser-based BDD | Playwright Test (Chromium) | 7 |
| E2E (legacy) | Deployed live API | Bash (`curl` + `python3`) | 23 |

## Commands

```bash
pnpm test              # All suites: API (64) + TS Client (28) + Python (39) + Playwright E2E (7) + README lint
pnpm test:api          # API only (64)
pnpm test:ts           # TS client only (28)
pnpm test:py           # Python tests (39, via uv run pytest)
pnpm test:e2e          # Playwright E2E tests (7)
./scripts/e2e.sh       # Legacy E2E against deployed API (23)
```

## Three-Layer Design

### Layer 1: Unit Tests

Test individual functions and modules in isolation. External dependencies are mocked at the lowest layer.

### Layer 2: Integration Tests

Exercise the full request/response chain through the real Hono app. Scrapers are mocked, but all middleware, validation, and serialization run for real.

### Layer 3: End-to-End Tests

Hit the deployed production API with real HTTP requests. No mocks — tests the actual running service.

---

## Golden Rule: No Harmful Mocks

**Never reimplement route handlers, middleware, or validation logic in a mock server.** This creates a parallel code path that silently drifts from production.

**Correct approach** — import the actual production `app` and serve it via `@hono/node-server`. Stub only external dependencies at the lowest layer:

- `fetch()` calls to third-party APIs (e.g. `ollama.com`) — cache responses in memory.
- Cloudflare Workers-only globals (`caches`, `ScheduledEvent`) — no-op stubs.

**Reference implementation**: `api/scripts/ci-server.ts` imports `app` from `api/src/index.ts`, intercepts `fetch()` to `ollama.com`, and serves the production app unchanged under Node.js.

**What NOT to do** (anti-pattern): `api/scripts/serve-for-ci.ts` — deleted because it reimplemented routes, skipped `withCache` middleware, bypassed `ErrorResponse` schema, and returned deterministic fixtures instead of exercising real scrapers.

---

## TypeScript Testing (Vitest)

### Framework & Config

- **Runner**: Vitest 4.x
- **Environment**: Node.js
- **Config files**: `api/vitest.config.ts`, `packages/ts-client/vitest.config.ts`

```typescript
// api/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
```

The ts-client config is minimal (no setup files needed):

```typescript
// packages/ts-client/vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node' },
});
```

### Global Test Setup (`api/src/__tests__/setup.ts`)

Runs before all API test modules. Installs a no-op `caches.default` stub on `globalThis` so the Cloudflare Workers Cache API doesn't throw in Node.js:

```typescript
const noopCache: Cache = {
  match: async () => undefined,
  put: async () => undefined,
  delete: async () => false,
  keys: async () => [],
  add: async () => undefined,
  addAll: async () => undefined,
} as unknown as Cache;

Object.defineProperty(globalThis, 'caches', {
  value: { default: noopCache },
  writable: true,
});
```

### Shared Test Config (`api/src/__tests__/shared-test-config.ts`)

Environment-overridable constants for integration tests:

```typescript
export const TEST_MODEL = process.env['OLLAMA_TEST_MODEL'] ?? 'qwen3';
export const NO_RESULTS_MODEL = process.env['OLLAMA_NO_RESULTS_MODEL'] ?? 'xyzabc-nonexistent-model-0000';
```

### TEST_ENV Pattern

Every API test file defines a `TEST_ENV` object matching the `Bindings` type. This simulates `wrangler.toml` `[vars]` for unit tests:

```typescript
const TEST_ENV = {
  OLLAMA_BASE: 'https://ollama.com',
  OLLAMA_USER_AGENT: 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  OLLAMA_ACCEPT: 'text/html,application/xhtml+xml',
  OLLAMA_ACCEPT_LANGUAGE: 'en-US,en;q=0.9',
};
```

### Mocking Patterns

#### Pattern 1: `vi.mock()` for scraper modules (route tests)

Used by route-level tests to intercept scraper calls. Mock is declared **before** importing the app so the module graph picks up the stub:

```typescript
vi.mock('../../search/scraper', () => ({
  scrapeSearchPage: vi.fn(),
}));

import { app } from '../../index';
import { scrapeSearchPage } from '../../search/scraper';

const mockSearch = vi.mocked(scrapeSearchPage);

beforeEach(() => {
  vi.clearAllMocks();
});
```

Route tests then call `app.request('/search?q=test', undefined, TEST_ENV)` to exercise the full Hono middleware chain with mocked scrapers.

#### Pattern 2: `vi.stubGlobal('fetch', ...)` for direct scraper tests

Used by scraper-level tests that need to control the HTML returned by `fetch()`:

```typescript
function mockFetch(html: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// In test:
vi.stubGlobal('fetch', mockFetch('<html>...</html>'));
const result = await scrapeSearchPage(1, 'qwen3', TEST_ENV);
```

The `afterEach(() => vi.unstubAllGlobals())` teardown is critical — it prevents mock leakage between tests.

#### Pattern 3: `globalThis.fetch` direct replacement (fetch utility tests)

Used by `fetch.test.ts` for testing `fetchWithRetry()`. Saves and restores `globalThis.fetch` manually:

```typescript
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// In test:
globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'));
```

#### Pattern 4: In-memory HTML cache (scraper integration tests)

`search/scraper.test.ts` caches real ollama.com HTML in a `Map<string, string>` so each URL is fetched at most once per test run:

```typescript
const htmlCache = new Map<string, string>();

async function fetchCached(url: string): Promise<string> {
  if (htmlCache.has(url)) return htmlCache.get(url)!;
  const res = await realFetch(url, { headers: {...} });
  const text = await res.text();
  htmlCache.set(url, text);
  return text;
}

beforeAll(async () => {
  // Pre-fetch real HTML for all test URLs
  vi.stubGlobal('fetch', fetchCached);
});
```

#### Pattern 5: `app.request()` for in-process HTTP testing

All route tests use Hono's built-in `app.request()` method — no HTTP server needed:

```typescript
const res = await app.request('/search?q=qwen3&page=1', undefined, TEST_ENV);
expect(res.status).toBe(200);
const body = await res.json();
```

The third argument (`TEST_ENV`) injects the Workers bindings.

#### Pattern 6: TS client integration test — fetch routed through Hono app

`packages/ts-client/src/__tests__/integration.test.ts` routes all `OllamaModelsClient` fetch calls through the real Hono app in-process:

```typescript
// Stub Cache API before importing app
Object.defineProperty(globalThis, 'caches', { ... });

vi.mock('../../../../api/src/search/scraper', () => ({ scrapeSearchPage: vi.fn() }));
vi.mock('../../../../api/src/model/scraper', () => ({ scrapeModelPage: vi.fn() }));

import { app } from '../../../../api/src/index';
import { OllamaModelsClient } from '../client';

function stubFetchThroughApp(): void {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    return app.request(url, init, TEST_ENV);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubFetchThroughApp();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = new OllamaModelsClient('http://localhost');
// client.search() now goes through the real Hono routes
```

### Test Structure

Tests use `describe` / `it` blocks with bilingual section headers:

```typescript
// === single page ===
// search() called with a plain page number: verifies SearchResult shape,
// correct scraper call args, and the default-to-page-1 behaviour.
//
// 단일 페이지 번호로 search() 호출: SearchResult 형태, 올바른 스크래퍼 호출 인수,
// 기본값 페이지 1 동작을 검증한다.

describe('search() — single page', () => { ... });
```

### Assertion Patterns

- `expect(res.status).toBe(200)` — HTTP status checks.
- `expect(body.keyword).toBe('qwen3')` — field value assertions.
- `expect((body.pages as unknown[]).length).toBe(2)` — array length with type assertion.
- `expect(mockSearch).toHaveBeenCalledWith(1, 'test', TEST_ENV)` — mock call verification.
- `expect(mockSearch).toHaveBeenCalledTimes(1)` — call count verification.
- `await expect(fn()).rejects.toThrow('message')` — async error assertions.
- `await expect(fn()).rejects.toBeInstanceOf(ParseError)` — error type assertions.

### Test File Map (API)

```
api/src/__tests__/
  setup.ts                       # Global Cache API stub
  shared-test-config.ts          # Shared test model constants
  routes/
    search.test.ts               # GET /search route (6 tests)
    model.test.ts                # GET /model route (7 tests)
    health.test.ts               # GET /health route (5 tests)
    openapi.test.ts              # GET /openapi.json (1 test)
  search/
    handler.test.ts              # search() handler logic (page range, dedup, retries)
    scraper.test.ts              # scrapeSearchPage() with real HTML cache
  model/
    scraper.test.ts              # scrapeModelPage() with mocked fetch
  lib/
    fetch.test.ts                # fetchWithRetry() retry/error behavior
  testing/
    ci-interceptor.test.ts       # createFetchInterceptor() regression tests
  health/
    check.test.ts                # runHealthCheck() and createProbeModel()
```

### Test File Map (TS Client)

```
packages/ts-client/src/__tests__/
  client.test.ts                 # OllamaModelsClient unit tests (mocked fetch)
  integration.test.ts            # OllamaModelsClient integration tests (through Hono app)
```

---

## Python Testing (pytest)

### Framework & Config

- **Runner**: pytest ≥ 8.0.0
- **Async**: pytest-asyncio ≥ 0.23.0 (mode: `auto` — async test functions run automatically without `@pytest.mark.asyncio`)
- **HTTP mocking**: pytest-httpx ≥ 0.21.0 (transport-level mock for httpx)
- **Config**: `pyproject.toml` `[tool.pytest.ini_options]` with `asyncio_mode = "auto"`

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"

[dependency-groups]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "pytest-httpx>=0.21.0",
    "pytest-cov>=6.0.0",
    "build>=1.0.0",
    "playwright>=1.58.0",
]
```

### Unit Tests (`tests/unit/`)

#### Mocking Pattern: pytest-httpx

Python unit tests use `pytest-httpx`'s `HTTPXMock` fixture to intercept httpx requests at the transport layer. No `vi.mock()` equivalent — the fixture is injected as a function parameter:

```python
from pytest_httpx import HTTPXMock

MOCK_SEARCH = {
    "pages": [{"http_url": "https://ollama.com/library/qwen3", "model_id": "library/qwen3"}],
    "page_range": 1,
    "keyword": "qwen3",
}

def test_search_returns_search_result(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    result = OllamaModelsClient().search("qwen3")
    assert len(result.pages) == 2
    assert result.pages[0].model_id == "library/qwen3"
```

#### Sync + Async Test Pairs

Every client method has both a sync and async test:

```python
def test_search_returns_search_result(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    result = OllamaModelsClient().search("qwen3")
    assert len(result.pages) == 2

async def test_search_async_returns_search_result(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    result = await OllamaModelsClient().search_async("qwen3")
    assert len(result.pages) == 2
```

#### Test Naming Convention

```
test_{method}_{behavior}
```

Examples: `test_search_returns_search_result`, `test_search_omits_q_param_when_keyword_is_empty`, `test_get_model_raises_on_http_error`.

#### Docstring Convention

Every test function has a docstring describing what it verifies:

```python
def test_search_omits_q_param_when_keyword_is_empty(httpx_mock: HTTPXMock):
    """Verifies that an empty keyword does not append a q param to the URL."""
```

#### Assertion Patterns

- `assert result.pages[0].model_id == "library/qwen3"` — field value checks.
- `assert "/search" in str(request.url)` — endpoint path verification.
- `assert "page=2" in str(request.url)` — query param verification.
- `assert "q=" not in str(request.url)` — param absence verification.
- `with pytest.raises(httpx.HTTPStatusError):` — error assertions.

#### Type Tests (`tests/unit/test_types.py`)

Separate tests for `@dataclass` construction — verifies field storage, nullable defaults, and union types:

```python
def test_model_list_allows_null_default_tag():
    """Verifies that ModelTags accepts None for default_tag when the model has no 'latest' tag."""
    model_list = ModelTags(page_url="...", id="...", tags=["..."], default_tag=None)
    assert model_list.default_tag is None
```

### Integration Tests (`tests/integration/`)

#### Pattern: Node.js CI Server Subprocess

Python integration tests start `api/scripts/ci-server.ts` as a subprocess. The CI server imports the real production Hono app, serves it on a local port, and intercepts `fetch()` calls to ollama.com with cached responses:

```python
CI_PORT = 8788

@pytest.fixture(scope="session")
def mock_api_url() -> Generator[str, None, None]:
    """Start the Node.js mock server and yield its base URL."""
    proc = subprocess.Popen(
        ["npx", "tsx", "api/scripts/ci-server.ts"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env={**os.environ, "PORT": str(CI_PORT)},
    )
    _wait_for_port("localhost", CI_PORT)
    yield f"http://localhost:{CI_PORT}"
    proc.terminate()
    proc.wait(timeout=5)
```

Tests use the real `OllamaModelsClient` against this local server:

```python
def test_search_returns_search_result(mock_api_url: str) -> None:
    """Client parses a SearchResult from the live mock server."""
    result = OllamaModelsClient(mock_api_url).search("qwen3")
    assert len(result.pages) >= 1
    assert "/" in result.pages[0].model_id
```

#### ci-interceptor.ts

The fetch interceptor (`api/src/testing/ci-interceptor.ts`) captures the original `globalThis.fetch` at creation time, then overrides it. ollama.com URLs go through an in-memory cache; non-ollama.com URLs pass through to the real fetch. This prevents infinite recursion (a previous bug).

Regression tests in `api/src/__tests__/testing/ci-interceptor.test.ts` verify:
1. ollama.com URLs are cached (second call returns cached response, no additional fetch).
2. Non-ollama.com URLs pass through to the original fetch.
3. No infinite recursion — the interceptor uses the captured original fetch, not the overridden one.

---

## End-to-End Tests (Bash)

### Script: `scripts/e2e.sh`

Runs against the deployed production API. Uses `curl` for HTTP requests and `python3` for JSON parsing.

```bash
./scripts/e2e.sh [BASE_URL]
# BASE_URL defaults to https://ollama.devcomfort.me/api
```

### What It Tests

- `GET /health` — returns 200, `ok: true`, has `timestamp` and `checks` fields.
- `GET /search?q=qwen3&page=1` — returns 200, has `pages`, `page_range`, `keyword`, first page has `model_id`.
- `GET /model?name=library/qwen3` — returns 200, has `page_url`, `id`, `tags`, `default_tag`.
- Validation: oversized `q` returns 400 with `INVALID_PARAMETER`.
- Validation: missing `name` returns 400.
- Validation: bare name without profile prefix returns 400.
- Scraper error: nonexistent model on high page number returns 502 or 200 (acceptable).

### Helper Functions

```bash
http()     # curl wrapper — saves response body and prints HTTP status code
json()     # reads saved response JSON
assert_eq()    # asserts equality with pass/fail counting
assert_has_key()  # asserts JSON key existence
```

### Smoke Test: `scripts/smoke-ts-client.sh`

Post-build verification of the ts-client `dist/` artifacts:

1. **CJS**: `require()` the `.cjs` file, verify all exports exist and are functions, instantiate `OllamaModelsClient`.
2. **ESM**: `import` the `.mjs` file, same checks.
3. **DTS**: verify `.d.cts` file exists and contains all public exports.

---

## CI Pipeline

### ci.yml — Three Jobs

| Job | What It Runs | Depends On |
|---|---|---|
| `api` | `npx nx type-check api` + `npx nx test api` | — |
| `ts-client` | `npx nx type-check ts-client` + `npx nx test ts-client` | api |
| `py-client` | `pytest unit/` + `pytest integration/` (starts ci-server.ts subprocess) | api |

Python CI installs: `pip install packages/py-client/` + `pip install "pytest>=8.0.0" "pytest-asyncio>=0.23.0" "pytest-httpx>=0.21.0"`.

### deploy.yml — E2E Gate

E2E tests run after production deploy as a gate before npm/docs publishing. If E2E fails, the ts-client and docs deploy jobs are skipped.

---

## Coverage Notes

- No explicit coverage thresholds enforced (no `--coverage` flag in any test command).
- Coverage is structural: each endpoint has route tests, handler tests, and scraper tests.
- The health check has the deepest coverage: unit tests for `createProbeModel`, `runHealthCheck` (both success paths, all error classification branches, aggregation priority), plus route tests, plus E2E.
- Python type tests ensure all `@dataclass` fields accept expected values and edge cases (null `default_tag`, `PageRangeDetail` union).
