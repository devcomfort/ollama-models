import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createProbeModel,
  PROBE_KEYWORD,
  runHealthCheck,
  buildHealthAlertMessage,
} from '../../health/check';
import { UpstreamError, ParseError } from '../../errors';

const TEST_ENV = {
  OLLAMA_BASE: 'https://ollama.com',
  OLLAMA_USER_AGENT: 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  OLLAMA_ACCEPT: 'text/html,application/xhtml+xml',
  OLLAMA_ACCEPT_LANGUAGE: 'en-US,en;q=0.9',
};

// === createProbeModel ===
// 검증 범위:
// - http_url이 OLLAMA_BASE를 기반으로 구성되는가.
// - model_id가 올바른 값인가.

describe('createProbeModel', () => {
  // Q. http_url이 기본값으로 구성되는가?
  it('builds http_url from OLLAMA_BASE', () => {
    const model = createProbeModel(TEST_ENV);
    expect(model.http_url).toBe('https://ollama.com/library/qwen3');
  });

  // Q. model_id가 library/qwen3인가?
  it('returns model_id as library/qwen3', () => {
    const model = createProbeModel(TEST_ENV);
    expect(model.model_id).toBe('library/qwen3');
  });
});

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

  // Q. search 스크래퍼가 실패하면 ok: false이고 search.error에 에러 메시지가 담기는가?
  it('returns ok:false and captures search.error when the search scraper throws', async () => {
    mockSearch.mockRejectedValue(new ParseError("selector 'a.group.w-full' may no longer match"));
    mockModel.mockResolvedValue({ page_url: '', id: '', tags: ['qwen3:latest'], default_tag: 'qwen3:latest' });

    const status = await runHealthCheck(TEST_ENV);

    expect(status.ok).toBe(false);
    expect(status.checks.search.ok).toBe(false);
    expect(status.checks.search.error).toContain('a.group.w-full');
    expect(status.checks.search.kind).toBe('structure_change');
    expect(status.failure_kind).toBe('structure_change');
  });

  // Q. model 스크래퍼가 실패하면 ok: false이고 model.error에 에러 메시지가 담기는가?
  it('returns ok:false and captures model.error when the model scraper throws', async () => {
    mockSearch.mockResolvedValue([{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }]);
    mockModel.mockRejectedValue(new Error('network timeout'));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.ok).toBe(false);
    expect(status.checks.model.ok).toBe(false);
    expect(status.checks.model.error).toContain('network timeout');
    expect(status.checks.model.kind).toBe('network_error');
    expect(status.failure_kind).toBe('network_error');
  });

  // Q. 두 스크래퍼 모두 실패해도 예외를 던지지 않고 ok: false를 반환하는가?
  it('두 스크래퍼 모두 실패해도 예외를 던지지 않고 ok: false를 반환하는가', async () => {
    mockSearch.mockRejectedValue(new Error('A'));
    mockModel.mockRejectedValue(new Error('B'));

    await expect(runHealthCheck(TEST_ENV)).resolves.toMatchObject({ ok: false });
  });

  // Q. UpstreamError가 upstream_down으로 분류되는가?
  it('업스트림 에러가 upstream_down으로 분류되는가', async () => {
    mockSearch.mockRejectedValue(new UpstreamError('Ollama returned HTTP 503', 503));
    mockModel.mockResolvedValue({ page_url: '', id: '', tags: ['qwen3:latest'], default_tag: 'qwen3:latest' });

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('upstream_down');
    expect(status.failure_kind).toBe('upstream_down');
  });

  // Q. 빈 HTML이 구조 변경으로 분류되는가?
  it('빈 HTML이 구조 변경으로 분류되는가', async () => {
    mockSearch.mockRejectedValue(new ParseError('no model cards found'));
    mockModel.mockResolvedValue({ page_url: '', id: '', tags: ['qwen3:latest'], default_tag: 'qwen3:latest' });

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('structure_change');
    expect(status.failure_kind).toBe('structure_change');
  });

  // Q. fetch 거부가 network_error로 분류되는가?
  it('fetch 거부가 network_error로 분류되는가', async () => {
    mockSearch.mockRejectedValue(new TypeError('fetch failed'));
    mockModel.mockResolvedValue({ page_url: '', id: '', tags: ['qwen3:latest'], default_tag: 'qwen3:latest' });

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('network_error');
    expect(status.failure_kind).toBe('network_error');
  });

  // Q. aggregation 우선순위: structure_change > upstream_down > network_error?
  it('aggregation 우선순위: structure_change > upstream_down > network_error', async () => {
    mockSearch.mockRejectedValue(new ParseError('selector broken'));
    mockModel.mockRejectedValue(new UpstreamError('HTTP 503', 503));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('structure_change');
    expect(status.checks.model.kind).toBe('upstream_down');
    expect(status.failure_kind).toBe('structure_change');
  });

  // Q. aggregation 우선순위: upstream_down > network_error?
  it('aggregation 우선순위: upstream_down > network_error', async () => {
    mockSearch.mockRejectedValue(new UpstreamError('HTTP 503', 503));
    mockModel.mockRejectedValue(new TypeError('fetch failed'));

    const status = await runHealthCheck(TEST_ENV);

    expect(status.checks.search.kind).toBe('upstream_down');
    expect(status.checks.model.kind).toBe('network_error');
    expect(status.failure_kind).toBe('upstream_down');
  });
});

// === buildHealthAlertMessage ===
// 검증 범위:
// - 실패한 check에 ❌ 표시와 에러 메시지가 포함되는가.
// - 통과한 check에 ✅ 표시와 count가 포함되는가.
// - PROBE_KEYWORD와 probeModel.model_id가 메시지에 포함되는가.
// - timestamp가 메시지에 포함되는가.

describe('buildHealthAlertMessage', () => {
  const probeModel = createProbeModel(TEST_ENV);

  // Q. 실패한 search check에 ❌와 에러 메시지가 포함되는가?
  it('includes ❌ and error message for a failed search check', () => {
    const status = {
      ok: false,
      timestamp: '2024-01-01T00:00:00.000Z',
      checks: {
        search: { ok: false, error: 'selector broken', kind: 'structure_change' },
        model: { ok: true, count: 5, kind: null },
      },
      failure_kind: 'structure_change',
    } as const;

    const msg = buildHealthAlertMessage(status, TEST_ENV, probeModel);

    expect(msg).toContain('❌');
    expect(msg).toContain('selector broken');
  });

  // Q. 통과한 model check에 ✅와 count가 포함되는가?
  it('포함되는가? ✅와 count가 통과한 model check에', () => {
    const status = {
      ok: false,
      timestamp: '2024-01-01T00:00:00.000Z',
      checks: {
        search: { ok: false, error: 'err', kind: 'network_error' },
        model: { ok: true, count: 5, kind: null },
      },
      failure_kind: 'network_error',
    } as const;

    const msg = buildHealthAlertMessage(status, TEST_ENV, probeModel);

    expect(msg).toContain('✅');
    expect(msg).toContain('5');
  });

  // Q. PROBE_KEYWORD가 메시지에 포함되는가?
  it('PROBE_KEYWORD가 메시지에 포함되는가', () => {
    const status = {
      ok: false,
      timestamp: '2024-01-01T00:00:00.000Z',
      checks: {
        search: { ok: false, error: 'err', kind: 'upstream_down' },
        model: { ok: false, error: 'err', kind: 'network_error' },
      },
      failure_kind: 'upstream_down',
    } as const;

    const msg = buildHealthAlertMessage(status, TEST_ENV, probeModel);

    expect(msg).toContain(PROBE_KEYWORD);
  });

  // Q. timestamp가 메시지에 포함되는가?
  it('timestamp가 메시지에 포함되는가', () => {
    const status = {
      ok: false,
      timestamp: '2024-01-01T00:00:00.000Z',
      checks: {
        search: { ok: false, error: 'err', kind: 'structure_change' },
        model: { ok: false, error: 'err', kind: 'structure_change' },
      },
      failure_kind: 'structure_change',
    } as const;

    const msg = buildHealthAlertMessage(status, TEST_ENV, probeModel);

    expect(msg).toContain('2024-01-01T00:00:00.000Z');
  });

  // Q. 두 check 모두 실패했을 때 에러가 없으면 '0개 결과' 문구가 포함되는가?
  it('두 check 모두 실패했을 때 에러가 없으면 "0개 결과" 문구가 포함되는가', () => {
    const status = {
      ok: false,
      timestamp: '2024-01-01T00:00:00.000Z',
      checks: {
        search: { ok: false, kind: null },
        model: { ok: false, kind: null },
      },
      failure_kind: null,
    } as const;

    const msg = buildHealthAlertMessage(status, TEST_ENV, probeModel);

    expect(msg).toContain('returned 0 results');
  });
});
