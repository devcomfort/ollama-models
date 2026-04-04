# TESTING.md — Test Structure and Practices

## Test Frameworks

| Package | Framework | Config |
|---|---|---|
| `api/` | Vitest ^2.0.0 | `api/vitest.config.ts` — Node env + setup file |
| `packages/ts-client/` | Vitest ^2.0.0 | `packages/ts-client/vitest.config.ts` — Node env |
| `packages/py-client/` | pytest ^8.0.0 + pytest-asyncio + pytest-httpx | `pyproject.toml` — `asyncio_mode = "auto"` |

## Test Locations

```
api/src/__tests__/
├── setup.ts                 ← Global test setup (Cache API stub)
├── index.test.ts            ← Route handler integration tests
├── search/
│   ├── scraper.test.ts      ← scrapeSearchPage unit tests
│   └── search.test.ts       ← search() multi-page/retry tests
└── model/
    └── scraper.test.ts      ← scrapeModelPage unit tests

packages/ts-client/src/__tests__/
└── client.test.ts           ← OllamaModelsClient unit tests

packages/py-client/tests/
├── __init__.py
├── test_client.py           ← OllamaModelsClient sync+async tests
└── test_types.py            ← Type construction/parse tests
```

## Running Tests

```bash
# All tests (TS + Python)
pnpm test

# API tests only
pnpm test:api

# TS client tests only
pnpm test:ts

# Python tests only
pnpm test:py
# (or directly: cd packages/py-client && rye run pytest)
```

## Mocking Strategy

### TypeScript (Vitest)

**Scraper tests** — stub `globalThis.fetch` directly:
```typescript
function mockFetch(html: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  });
}

vi.stubGlobal('fetch', mockFetch(LIBRARY_MODELS_HTML));
// After each test: vi.unstubAllGlobals()
```

**Route handler tests** — vi.mock the scraper modules (hoisted):
```typescript
vi.mock('../search/scraper', () => ({ scrapeSearchPage: vi.fn() }));
vi.mock('../model/scraper', () => ({ scrapeModelPage: vi.fn() }));
// Then: mockSearch.mockResolvedValue([...])
```

**Client tests** — stub `globalThis.fetch` with JSON mock:
```typescript
function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}
```

### Python (pytest-httpx)

```python
def test_search_returns_search_result(httpx_mock: HTTPXMock):
    httpx_mock.add_response(json=MOCK_SEARCH)
    result = OllamaModelsClient().search("qwen3")
    assert result.keyword == "qwen3"
```

`asyncio_mode = "auto"` in `pyproject.toml` means async tests need no special decorator.

## Test Setup (API)

`api/src/__tests__/setup.ts` stubs the Cloudflare Workers `caches` global for Node.js vitest:
```typescript
const noopCache: Cache = {
  match: async () => undefined,
  put: async () => undefined,
  delete: async () => false,
  // ...
} as unknown as Cache;
Object.defineProperty(globalThis, 'caches', { value: { default: noopCache }, writable: true });
```

## Test Fixtures

Both TS and Python define shared mock payloads as module-level constants:

```typescript
// TypeScript
const MOCK_SEARCH: unknown = {
  pages: [
    { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' },
  ],
  page_range: 1,
  keyword: 'qwen3',
};
```

```python
# Python
MOCK_SEARCH = {
    "pages": [{"http_url": "https://ollama.com/library/qwen3", "model_id": "library/qwen3"}],
    "page_range": 1,
    "keyword": "qwen3",
}
```

## Test Coverage Areas

### API layer

| Area | Coverage |
|---|---|
| `GET /search` — happy path, defaults, page clamping | ✅ |
| `GET /search` — scraper throws → 500 | ✅ |
| `GET /model` — happy path, URL normalization | ✅ |
| `GET /model` — missing name → 400 | ✅ |
| `GET /model` — no slash → 400 | ✅ |
| `GET /health` — 200 when both ok, 503 when either fails | ✅ |
| `scrapeSearchPage` — dedup, library+community, navigation filter | ✅ |
| `scrapeSearchPage` — fetch error, selector miss | ✅ |
| `scrapeModelPage` — library strip, community prefix, dedup | ✅ |
| `scrapeModelPage` — fetch error, selector miss | ✅ |

### TS client

| Area | Coverage |
|---|---|
| `DEFAULT_BASE_URL` value | ✅ |
| Constructor trailing slash strip | ✅ |
| `search()` parse, query params | ✅ |
| `getModel()` parse, name normalization | ✅ |
| HTTP error → throws | ✅ |
| Schema validation rejects malformed data | ✅ |

### Python client

| Area | Coverage |
|---|---|
| Sync and async variants of search/model/health | ✅ |
| Custom base URL | ✅ |
| HTTP error (`.raise_for_status()`) | ✅ |
| Type parsing from JSON | ✅ |

## Test Description Style

Test descriptions follow a **behavior-description** pattern — comments explain *what is verified*:
```typescript
// Verifies duplicate URLs are removed and unique library model URLs are returned.
it('returns unique library model URLs', async () => { ... });
```

Each test verifies a single specific behavior. No test names like "works correctly" or "handles errors".
