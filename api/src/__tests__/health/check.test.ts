import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PROBE_KEYWORD,
  runHealthCheck,
} from '../../health/check';
import { UpstreamError, ParseError } from '../../errors';

const TEST_ENV = {
  OLLAMA_BASE: 'https://ollama.com',
  OLLAMA_USER_AGENT: 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  OLLAMA_ACCEPT: 'text/html,application/xhtml+xml',
  OLLAMA_ACCEPT_LANGUAGE: 'en-US,en;q=0.9',
};


// === runHealthCheck ===
// scrapeSearchPage / scrapeModelPage를 모킹하여 각 분기를 검증한다.

vi.mock('../../search/scraper', () => ({ scrapeSearchPage: vi.fn() }));
vi.mock('../../model/scraper', () => ({ scrapeModelPage: vi.fn() }));

import { scrapeSearchPage } from '../../search/scraper';
import { scrapeModelPage } from '../../model/scraper';

const mockSearch = vi.mocked(scrapeSearchPage);
const mockModel = vi.mocked(scrapeModelPage);

afterEach(() => {
  vi.clearAllMocks();
});

describe('runHealthCheck', () => {
  // Q. 두 스크래퍼가 모두 성공하면 ok:true와 정확한 반환?
  it('returns ok:true and correct counts when both scrapers succeed', async () => {
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

    const status = await runHealthCheck(TEST_ENV);

    expect(status.ok).toBe(true);
    expect(status.checks.search.ok).toBe(true);
    expect(status.checks.search.count).toBe(2);
    expect(status.checks.search.kind).toBeNull();
    expect(status.checks.model.ok).toBe(true);
    expect(status.checks.model.count).toBe(3);
    expect(status.checks.model.kind).toBeNull();
    expect(status.failure_kind).toBeNull();
  });

  // Q. 결과에 ISO 8601 형식의 timestamp가 포함되는가?
  it('결과에 ISO 8601 형식의 timestamp가 포함되는가', async () => {
    mockSearch.mockResolvedValue([{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }]);
    mockModel.mockResolvedValue({ page_url: '', id: '', tags: ['qwen3:latest'], default_tag: 'qwen3:latest' });

    const status = await runHealthCheck(TEST_ENV);

    expect(() => new Date(status.timestamp)).not.toThrow();
    expect(new Date(status.timestamp).toISOString()).toBe(status.timestamp);
  });

  // Q. search 스크래퍼가 실패하면 ok: false이고 model도 skipped?
  it('returns ok:false when search fails; model probe is skipped', async () => {
    mockSearch.mockRejectedValue(new ParseError("selector 'a.group.w-full' may no longer match"));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.ok).toBe(false);
    expect(status.checks.search.ok).toBe(false);
    expect(status.checks.search.error).toContain('a.group.w-full');
    expect(status.checks.search.kind).toBe('structure_change');
    expect(status.checks.model.ok).toBe(false);
    expect(status.checks.model.kind).toBe('structure_change'); // skipped
    expect(status.failure_kind).toBe('structure_change');
  });

  // Q. model 스크래퍼가 실패하면 ok: false이고 model.error에 에러 메시지가 담기는가?
  it('returns ok:false and captures model.error when the model scraper throws', async () => {
    mockSearch.mockResolvedValue([{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }]);
    mockModel.mockRejectedValue(new Error('network timeout'));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.ok).toBe(false);
    expect(status.checks.search.ok).toBe(true);
    expect(status.checks.model.ok).toBe(false);
    expect(status.checks.model.error).toContain('network timeout');
    expect(status.checks.model.kind).toBe('network_error');
    expect(status.failure_kind).toBe('network_error');
  });

  // Q. search 실패 시 model도 skipped되어 둘 다 ok: false?
  it('search 실패 시 model도 skipped되어 둘 다 ok: false', async () => {
    mockSearch.mockRejectedValue(new Error('A'));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.ok).toBe(false);
    expect(status.checks.search.ok).toBe(false);
    expect(status.checks.model.ok).toBe(false);
  });

  // Q. UpstreamError가 upstream_down으로 분류되는가?
  it('업스트림 에러가 upstream_down으로 분류되는가', async () => {
    mockSearch.mockRejectedValue(new UpstreamError('Ollama returned HTTP 503', 503));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('upstream_down');
    expect(status.checks.model.kind).toBe('structure_change'); // skipped
    expect(status.failure_kind).toBe('structure_change'); // model skipped
  });

  // Q. 빈 HTML이 구조 변경으로 분류되는가?
  it('빈 HTML이 구조 변경으로 분류되는가', async () => {
    mockSearch.mockRejectedValue(new ParseError('no model cards found'));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('structure_change');
    expect(status.checks.model.kind).toBe('structure_change'); // skipped
    expect(status.failure_kind).toBe('structure_change');
  });

  // Q. fetch 거부가 network_error로 분류되는가?
  it('fetch 거부가 network_error로 분류되는가', async () => {
    mockSearch.mockRejectedValue(new TypeError('fetch failed'));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('network_error');
    expect(status.checks.model.kind).toBe('structure_change'); // skipped
    expect(status.failure_kind).toBe('structure_change'); // model skipped
  });

  // Q. aggregation 우선순위: search structure_change > model skipped?
  it('aggregation 우선순위: structure_change > network_error', async () => {
    mockSearch.mockRejectedValue(new ParseError('selector broken'));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('structure_change');
    expect(status.checks.model.kind).toBe('structure_change'); // skipped
    expect(status.failure_kind).toBe('structure_change');
  });

  // Q. search 성공 + model 실패 시 failure_kind는 model의 kind?
  it('search 성공 + model 실패 시 failure_kind는 model의 kind', async () => {
    mockSearch.mockResolvedValue([{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }]);
    mockModel.mockRejectedValue(new TypeError('fetch failed'));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBeNull();
    expect(status.checks.model.kind).toBe('network_error');
    expect(status.failure_kind).toBe('network_error');
  });
});

