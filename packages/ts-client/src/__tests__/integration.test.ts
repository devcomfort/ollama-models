// Stub the Cloudflare Workers Cache API before importing `app`.
Object.defineProperty(globalThis, 'caches', {
  value: {
    default: {
      match: async () => undefined,
      put: async () => undefined,
    },
  },
  writable: true,
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock scrapers before `app` is loaded so the route handlers receive stubs.
vi.mock('../../../../api/src/search/scraper', () => ({
  scrapeSearchPage: vi.fn(),
}));
vi.mock('../../../../api/src/model/scraper', () => ({
  scrapeModelPage: vi.fn(),
}));

import { app } from '../../../../api/src/index';
import { scrapeSearchPage } from '../../../../api/src/search/scraper';
import { scrapeModelPage } from '../../../../api/src/model/scraper';
import { OllamaModelsClient } from '../client';

const mockSearch = vi.mocked(scrapeSearchPage);
const mockModel = vi.mocked(scrapeModelPage);

/**
 * Route every `fetch(url, init)` call through the Hono app so the client
 * talks to the real route handlers without a network server.
 */
function stubFetchThroughApp(): void {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    return app.request(url, init);
  });
}

// Before each test: reset all mock call histories so toHaveBeenCalledWith()
// reflects only the current test, then re-stub global fetch to forward every
// OllamaModelsClient request through the Hono app in-process.
beforeEach(() => {
  vi.clearAllMocks();
  stubFetchThroughApp();
});

// After each test: restore the real global fetch so the stub does not bleed
// into the next test or into unrelated test files.
afterEach(() => {
  vi.unstubAllGlobals();
});

// All tests share one client instance. The URL (http://localhost) is irrelevant
// because every fetch call is intercepted and routed through app.request().
const client = new OllamaModelsClient('http://localhost');

// ─── search ───────────────────────────────────────────────────────────────────
// Exercises client.search() through the full chain: scraper mock → Hono route
// handler → JSON serialization → client Zod deserialization. Covers happy path,
// query param forwarding, and scraper error → 500 → client exception.

describe('client.search() against live Hono app', () => {
  it('parses a SearchResult from the /search response', async () => {
    mockSearch.mockResolvedValue([
      { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' },
      { http_url: 'https://ollama.com/library/mistral', model_id: 'library/mistral' },
    ]);

    const result = await client.search('qwen3', 1);

    expect(result.keyword).toBe('qwen3');
    expect(result.page_range).toBe(1);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].http_url).toBe('https://ollama.com/library/qwen3');
    expect(result.pages[0].model_id).toBe('library/qwen3');
  });

  it('forwards keyword and page as query parameters', async () => {
    mockSearch.mockResolvedValue([]);
    await client.search('mistral', 3);
    expect(mockSearch).toHaveBeenCalledWith(3, 'mistral');
  });

  it('throws on scraper failure (500 from API)', async () => {
    mockSearch.mockRejectedValue(new Error('scraper failed'));
    await expect(client.search('broken')).rejects.toThrow('HTTP 500');
  });
});

// ─── getModel ───────────────────────────────────────────────────────────────────
// Exercises client.getModel() through the full chain. Covers happy path with
// all ModelTags fields, null default_tag survival, and scraper error → 500.

describe('client.getModel() against live Hono app', () => {
  it('parses a ModelTags response', async () => {
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:latest', 'qwen3:4b', 'qwen3:8b'],
      default_tag: 'qwen3:latest',
    });

    const result = await client.getModel('library/qwen3');

    expect(result.id).toBe('library/qwen3');
    expect(result.tags).toEqual(['qwen3:latest', 'qwen3:4b', 'qwen3:8b']);
    expect(result.default_tag).toBe('qwen3:latest');
  });

  it('parses null default_tag when no latest tag exists', async () => {
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:4b'],
      default_tag: null,
    });

    const result = await client.getModel('library/qwen3');
    expect(result.default_tag).toBeNull();
  });

  it('throws on scraper failure (500 from API)', async () => {
    mockModel.mockRejectedValue(new Error('scrape error'));
    await expect(client.getModel('library/qwen3')).rejects.toThrow('HTTP 500');
  });
});

// ─── health ─────────────────────────────────────────────────────────────────────
// Exercises client.health() through the full chain. Verifies that the nested
// checks object (search + model CheckResult) survives serialization intact.

describe('client.health() against live Hono app', () => {
  it('parses a HealthStatus with nested checks', async () => {
    mockSearch.mockResolvedValue([
      { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' },
    ]);
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:latest'],
      default_tag: 'qwen3:latest',
    });

    const status = await client.health();

    expect(status.ok).toBe(true);
    expect(typeof status.timestamp).toBe('string');
    expect(status.checks.search.ok).toBe(true);
    expect(status.checks.model.ok).toBe(true);
  });
});
