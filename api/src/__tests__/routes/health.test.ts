import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../search/scraper', () => ({
  scrapeSearchPage: vi.fn(),
}));
vi.mock('../../model/scraper', () => ({
  scrapeModelPage: vi.fn(),
}));

import { app } from '../../index';
import { scrapeSearchPage } from '../../search/scraper';
import { scrapeModelPage } from '../../model/scraper';
import { ParseError } from '../../errors';

const mockSearch = vi.mocked(scrapeSearchPage);
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

describe('GET /health', () => {
  it('returns 200 and ok:true when both scrapers succeed', async () => {
    mockSearch.mockResolvedValue([{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }]);
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:latest', 'qwen3:4b'],
      default_tag: 'qwen3:latest',
    });

    const res = await app.request('/health', undefined, TEST_ENV);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect((body.checks as Record<string, { ok: boolean }>).search.ok).toBe(true);
    expect((body.checks as Record<string, { ok: boolean }>).model.ok).toBe(true);
    expect(typeof body.timestamp).toBe('string');
    expect(body.failure_kind).toBeNull();
  });

  it('returns 503 and ok:false when the search scraper fails', async () => {
    mockSearch.mockRejectedValue(
      new Error("selector 'a.group.w-full' may no longer match"),
    );
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:latest'],
      default_tag: 'qwen3:latest',
    });

    const res = await app.request('/health', undefined, TEST_ENV);
    expect(res.status).toBe(503);

    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    const searchCheck = (body.checks as Record<string, { ok: boolean; error?: string; kind: string | null }>).search;
    expect(searchCheck.ok).toBe(false);
    expect(searchCheck.error).toContain('a.group.w-full');
    expect(searchCheck.kind).toBe('network_error');
    expect(body.failure_kind).toBe('network_error');
  });

  it('returns 503 and ok:false when the model scraper fails', async () => {
    mockSearch.mockResolvedValue([{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }]);
    mockModel.mockRejectedValue(
      new Error("selector 'a[href^=\"/\"][href*=\":\"]' may no longer match"),
    );

    const res = await app.request('/health', undefined, TEST_ENV);
    expect(res.status).toBe(503);

    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    const modelCheck = (body.checks as Record<string, { ok: boolean; error?: string; kind: string | null }>).model;
    expect(modelCheck.ok).toBe(false);
    expect(modelCheck.kind).toBe('network_error');
  });

  it('reflects the result count in each check', async () => {
    mockSearch.mockResolvedValue([
      { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' },
      { http_url: 'https://ollama.com/library/mistral', model_id: 'library/mistral' },
    ]);
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:latest', 'qwen3:4b', 'qwen3:8b'],
      default_tag: 'qwen3:latest',
    });

    const res = await app.request('/health', undefined, TEST_ENV);
    const body = await res.json() as Record<string, unknown>;
    const checks = body.checks as Record<string, { count: number }>;
    expect(checks.search.count).toBe(2);
    expect(checks.model.count).toBe(3);
  });

  it('returns structure_change kind when search scraper throws ParseError', async () => {
    mockSearch.mockRejectedValue(new ParseError('selector broken'));
    mockModel.mockResolvedValue({
      page_url: 'https://ollama.com/library/qwen3',
      id: 'library/qwen3',
      tags: ['qwen3:latest'],
      default_tag: 'qwen3:latest',
    });

    const res = await app.request('/health', undefined, TEST_ENV);
    expect(res.status).toBe(503);

    const body = await res.json() as Record<string, unknown>;
    const searchCheck = (body.checks as Record<string, { ok: boolean; kind: string | null }>).search;
    expect(searchCheck.kind).toBe('structure_change');
    expect(body.failure_kind).toBe('structure_change');
  });
});
