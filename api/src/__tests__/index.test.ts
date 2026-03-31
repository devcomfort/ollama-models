import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — runs before imports resolve
vi.mock('../scraper', () => ({
  scrapeSearchPage: vi.fn(),
  scrapeModelPage: vi.fn(),
}));

import app from '../index';
import { scrapeSearchPage, scrapeModelPage } from '../scraper';

const mockSearch = vi.mocked(scrapeSearchPage);
const mockModel = vi.mocked(scrapeModelPage);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /search ──────────────────────────────────────────────────────────────

describe('GET /search', () => {
  it('returns a SearchResult with model pages', async () => {
    mockSearch.mockResolvedValue([
      'https://ollama.com/library/qwen3',
      'https://ollama.com/library/mistral',
    ]);

    const res = await app.request('/search?q=qwen3&page=1');
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.keyword).toBe('qwen3');
    expect(body.page_id).toBe(1);
    expect((body.pages as unknown[]).length).toBe(2);
    expect((body.pages as { http_url: string }[])[0].http_url).toBe(
      'https://ollama.com/library/qwen3',
    );
  });

  it('defaults page to 1 when the param is absent', async () => {
    mockSearch.mockResolvedValue([]);
    const res = await app.request('/search?q=test');
    const body = await res.json() as Record<string, unknown>;
    expect(body.page_id).toBe(1);
    expect(mockSearch).toHaveBeenCalledWith(1, 'test');
  });

  it('defaults keyword to empty string when q is absent', async () => {
    mockSearch.mockResolvedValue([]);
    await app.request('/search');
    expect(mockSearch).toHaveBeenCalledWith(1, '');
  });

  it('clamps an invalid page value to 1', async () => {
    mockSearch.mockResolvedValue([]);
    await app.request('/search?page=0');
    expect(mockSearch).toHaveBeenCalledWith(1, '');
  });

  it('returns 500 when the scraper throws', async () => {
    mockSearch.mockRejectedValue(new Error('scraper failure'));
    const res = await app.request('/search?q=test');
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(String(body.error)).toContain('scraper failure');
  });
});

// ─── GET /model ───────────────────────────────────────────────────────────────

describe('GET /model', () => {
  it('returns a ModelList with correct IDs for a library model', async () => {
    mockModel.mockResolvedValue({
      tags: ['latest', '4b', '8b'],
      modelPageUrl: 'https://ollama.com/library/qwen3',
    });

    const res = await app.request('/model?name=qwen3');
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.default_model_id).toBe('qwen3:latest');
    expect((body.model_list as unknown[]).length).toBe(3);
    expect((body.model_list as { http_url: string; id: string }[])[0]).toEqual({
      http_url: 'https://ollama.com/library/qwen3',
      id: 'qwen3:latest',
    });
  });

  it('uses the first tag as default when "latest" is not present', async () => {
    mockModel.mockResolvedValue({
      tags: ['4b', '8b'],
      modelPageUrl: 'https://ollama.com/library/qwen3',
    });

    const res = await app.request('/model?name=qwen3');
    const body = await res.json() as Record<string, unknown>;
    expect(body.default_model_id).toBe('qwen3:4b');
  });

  it('uses the full path as ID prefix for user models', async () => {
    mockModel.mockResolvedValue({
      tags: ['v1'],
      modelPageUrl: 'https://ollama.com/RogerBen/custom-model',
    });

    const res = await app.request('/model?name=RogerBen/custom-model');
    const body = await res.json() as Record<string, unknown>;
    expect((body.model_list as { id: string }[])[0].id).toBe('RogerBen/custom-model:v1');
  });

  it('returns 400 when the name parameter is missing', async () => {
    const res = await app.request('/model');
    expect(res.status).toBe(400);
  });

  it('returns 400 when the name parameter is blank', async () => {
    const res = await app.request('/model?name=');
    expect(res.status).toBe(400);
  });

  it('returns 500 when the scraper throws', async () => {
    mockModel.mockRejectedValue(new Error('network error'));
    const res = await app.request('/model?name=qwen3');
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(String(body.error)).toContain('network error');
  });
});
