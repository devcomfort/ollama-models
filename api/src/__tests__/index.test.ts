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

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted — runs before imports resolve
vi.mock('../search/scraper', () => ({
  scrapeSearchPage: vi.fn(),
}));
vi.mock('../model/scraper', () => ({
  scrapeModelPage: vi.fn(),
}));

import { app } from '../index';
import { scrapeSearchPage } from '../search/scraper';
import { scrapeModelPage } from '../model/scraper';
import { ParseError } from '../errors';

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

// === GET /search ===
// Covers: scraper is called with the correct page/keyword args, response is
// wrapped in a SearchResult envelope, page defaults to 1, invalid page is
// clamped to 1, and scraper errors are forwarded as 500 { error } responses.
//
// 검증 범위: 스크래퍼에 올바른 page/keyword 인수가 전달되는지, 응답이 SearchResult
// 래퍼로 감싸지는지, page 기본값이 1인지, 잘못된 page가 1로 보정되는지,
// 스크래퍼 에러가 500 { error } 응답으로 전달되는지.

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

// === GET /model ===
// Covers: ModelTags shape for library and community models, null default_tag,
// missing/blank/bare-name 400 validation errors, and scraper error → 500.
//
// 검증 범위: 라이브러리 및 커뮤니티 모델의 ModelTags 형태, null default_tag,
// 누락/빈값/프로필 없는 이름에 대한 400 검증 에러, 스크래퍼 에러 → 500.

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

// === GET /health ===
// Covers: 200 ok:true when both probes pass, 503 ok:false for each individual
// probe failure with error capture, and per-probe result count reflection.
//
// 검증 범위: 두 프로브 모두 통과 시 200 ok:true, 각 프로브 실패 시 에러 캡처와
// 함께 503 ok:false, 프로브별 결과 수 반영.

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
      new Error("selector 'a[class*=\"flex flex-col\"]' may no longer match"),
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
