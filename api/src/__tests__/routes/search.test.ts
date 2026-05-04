import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../search/scraper', () => ({
  scrapeSearchPage: vi.fn(),
}));
vi.mock('../../alerts/service', () => ({
  createAlertService: () => ({ send: vi.fn() }),
}));

import { app } from '../../index';
import { scrapeSearchPage } from '../../search/scraper';

const mockSearch = vi.mocked(scrapeSearchPage);

const TEST_ENV = {
  OLLAMA_BASE: 'https://ollama.com',
  OLLAMA_USER_AGENT: 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  OLLAMA_ACCEPT: 'text/html,application/xhtml+xml',
  OLLAMA_ACCEPT_LANGUAGE: 'en-US,en;q=0.9',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /search', () => {
  it('returns a SearchResult with model pages', async () => {
    mockSearch.mockResolvedValue([
      { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' },
      { http_url: 'https://ollama.com/library/mistral', model_id: 'library/mistral' },
    ]);

    const res = await app.request('/search?q=qwen3&page=1', undefined, TEST_ENV);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.keyword).toBe('qwen3');
    expect(body.page_range).toBe(1);
    expect((body.pages as unknown[]).length).toBe(2);
    expect((body.pages as { http_url: string }[])[0].http_url).toBe(
      'https://ollama.com/library/qwen3',
    );
  });

  it('populates model_id for a library model', async () => {
    mockSearch.mockResolvedValue([{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }]);

    const res = await app.request('/search?q=qwen3&page=1', undefined, TEST_ENV);
    const body = await res.json() as Record<string, unknown>;
    const page = (body.pages as { model_id: string }[])[0];
    expect(page.model_id).toBe('library/qwen3');
  });

  it('populates model_id for a community model', async () => {
    mockSearch.mockResolvedValue([{ http_url: 'https://ollama.com/alibayram/smollm3', model_id: 'alibayram/smollm3' }]);

    const res = await app.request('/search?q=smollm3&page=1', undefined, TEST_ENV);
    const body = await res.json() as Record<string, unknown>;
    const page = (body.pages as { model_id: string }[])[0];
    expect(page.model_id).toBe('alibayram/smollm3');
  });

  it('defaults page to 1 when the param is absent', async () => {
    mockSearch.mockResolvedValue([]);
    const res = await app.request('/search?q=test', undefined, TEST_ENV);
    const body = await res.json() as Record<string, unknown>;
    expect(body.page_range).toBe(1);
    expect(mockSearch).toHaveBeenCalledWith(1, 'test', TEST_ENV);
  });

  it('defaults keyword to empty string when q is absent', async () => {
    mockSearch.mockResolvedValue([]);
    await app.request('/search', undefined, TEST_ENV);
    expect(mockSearch).toHaveBeenCalledWith(1, '', TEST_ENV);
  });

  it('clamps an invalid page value to 1', async () => {
    mockSearch.mockResolvedValue([]);
    await app.request('/search?page=0', undefined, TEST_ENV);
    expect(mockSearch).toHaveBeenCalledWith(1, '', TEST_ENV);
  });

  it('returns 502 when the scraper throws', async () => {
    mockSearch.mockRejectedValue(new Error('scraper failure'));
    const res = await app.request('/search?q=test', undefined, TEST_ENV);
    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    const error = body.error as { code: string; message: string; detail: string };
    expect(error.code).toBe('SCRAPE_UPSTREAM_ERROR');
    expect(error.detail).toContain('scraper failure');
  });
});
