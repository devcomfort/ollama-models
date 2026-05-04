import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../model/scraper', () => ({
  scrapeModelPage: vi.fn(),
}));
vi.mock('../../alerts/service', () => ({
  createAlertService: () => ({ send: vi.fn() }),
}));

import { app } from '../../index';
import { scrapeModelPage } from '../../model/scraper';

const mockModel = vi.mocked(scrapeModelPage);

const TEST_ENV = {
  OLLAMA_BASE: 'https://ollama.com',
  OLLAMA_USER_AGENT: 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  OLLAMA_ACCEPT: 'text/html,application/xhtml+xml',
  OLLAMA_ACCEPT_LANGUAGE: 'en-US,en;q=0.9',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /model', () => {
  it('returns a ModelTags with tags and id for a library model', async () => {
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:latest', 'qwen3:4b', 'qwen3:8b'],
      default_tag: 'qwen3:latest',
    });

    const res = await app.request('/model?name=library/qwen3', undefined, TEST_ENV);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.page_url).toBe('https://ollama.com/library/qwen3');
    expect(body.id).toBe('library/qwen3');
    expect(body.tags).toEqual(['qwen3:latest', 'qwen3:4b', 'qwen3:8b']);
    expect(body.default_tag).toBe('qwen3:latest');
  });

  it('sets default_tag to null when "latest" tag is not present', async () => {
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:4b', 'qwen3:8b'],
      default_tag: null,
    });

    const res = await app.request('/model?name=library/qwen3', undefined, TEST_ENV);
    const body = await res.json() as Record<string, unknown>;
    expect(body.default_tag).toBeNull();
  });

  it('uses the full path as id for user models', async () => {
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/RogerBen/custom-model',
      id: 'RogerBen/custom-model',
      tags: ['RogerBen/custom-model:v1'],
      default_tag: null,
    });

    const res = await app.request('/model?name=RogerBen/custom-model', undefined, TEST_ENV);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBe('RogerBen/custom-model');
    expect(body.tags).toEqual(['RogerBen/custom-model:v1']);
  });

  it('returns 400 when the name parameter is missing', async () => {
    const res = await app.request('/model', undefined, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it('returns 400 when the name parameter is blank', async () => {
    const res = await app.request('/model?name=', undefined, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it('returns 400 when a bare model name without profile prefix is given', async () => {
    const res = await app.request('/model?name=qwen3', undefined, TEST_ENV);
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    const error = body.error as { code: string; message: string };
    expect(error.code).toBe('INVALID_PARAMETER');
    expect(error.message).toContain('library/qwen3');
  });

  it('returns 502 when the scraper throws', async () => {
    mockModel.mockRejectedValue(new Error('network error'));
    const res = await app.request('/model?name=library/qwen3', undefined, TEST_ENV);
    expect(res.status).toBe(502);
    const body = await res.json() as Record<string, unknown>;
    const error = body.error as { code: string; message: string; detail: string };
    expect(error.code).toBe('SCRAPE_UPSTREAM_ERROR');
    expect(error.detail).toContain('network error');
  });
});
