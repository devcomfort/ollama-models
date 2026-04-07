import { describe, it, expect, vi, afterEach } from 'vitest';
import { search } from '../../search/search';
import { scrapeSearchPage } from '../../search/scraper';

vi.mock('../../search/scraper', () => ({
  scrapeSearchPage: vi.fn(),
}));

const mockScrape = vi.mocked(scrapeSearchPage);

// Resets mock call counts and return-value queues after each test so that
// toHaveBeenCalledTimes() assertions are always scoped to a single test.
//
// 각 테스트 후 mock 호출 횟수와 반환값 큐를 초기화하여 toHaveBeenCalledTimes()
// 단언이 항상 단일 테스트에만 적용되도록 한다.
afterEach(() => {
  vi.clearAllMocks();
});

// ─── fixtures ─────────────────────────────────────────────────────────────────
// Shared ModelPage arrays used across multiple tests. PAGE_2 contains
// 'library/qwen3' which also appears in PAGE_1, making it suitable for
// cross-page deduplication assertions.
//
// 여러 테스트에서 공유하는 ModelPage 배열. PAGE_2는 PAGE_1에도 나타나는
// 'library/qwen3'를 포함하여 페이지 간 중복 제거 단언에 적합하다.

const PAGE_1 = [
  { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' },
  { http_url: 'https://ollama.com/library/mistral', model_id: 'library/mistral' },
];
const PAGE_2 = [
  { http_url: 'https://ollama.com/library/llama3', model_id: 'library/llama3' },
  { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }, // duplicate
];
const PAGE_3 = [
  { http_url: 'https://ollama.com/library/gemma3', model_id: 'library/gemma3' },
];

// ─── single page ────────────────────────────────────────────────────────────────
// search() called with a plain page number: verifies SearchResult shape,
// correct scraper call args, and the default-to-page-1 behaviour.
//
// 단일 페이지 번호로 search() 호출: SearchResult 형태, 올바른 스크래퍼 호출 인수,
// 기본값 페이지 1 동작을 검증한다.

describe('search() — single page', () => {
  it('returns a SearchResult for the requested page', async () => {
    mockScrape.mockResolvedValue(PAGE_1);
    const result = await search('qwen3', 1);
    expect(result.keyword).toBe('qwen3');
    expect(result.page_range).toBe(1);
    expect(result.pages).toEqual(PAGE_1);
  });

  it('calls scrapeSearchPage once with the correct arguments', async () => {
    mockScrape.mockResolvedValue(PAGE_1);
    await search('mistral', 2);
    expect(mockScrape).toHaveBeenCalledOnce();
    expect(mockScrape).toHaveBeenCalledWith(2, 'mistral');
  });

  it('defaults range to page 1 when omitted', async () => {
    mockScrape.mockResolvedValue(PAGE_1);
    await search('qwen3');
    expect(mockScrape).toHaveBeenCalledWith(1, 'qwen3');
  });
});

// ─── page range ────────────────────────────────────────────────────────────────
// search() called with a { from, to } range object: verifies parallel fetch
// of all pages, cross-page deduplication, page_range storage, single-element
// range edge case, partial results on page failure, and ascending order.
//
// { from, to } 범위 객체로 search() 호출: 모든 페이지의 병렬 가져오기,
// 페이지 간 중복 제거, page_range 저장, 단일 요소 범위 엣지 케이스,
// 페이지 실패 시 부분 결과, 오름차순 정렬을 검증한다.

describe('search() — page range', () => {
  it('fetches all pages concurrently', async () => {
    mockScrape
      .mockResolvedValueOnce(PAGE_1)
      .mockResolvedValueOnce(PAGE_2)
      .mockResolvedValueOnce(PAGE_3);

    await search('qwen3', { from: 1, to: 3 });

    expect(mockScrape).toHaveBeenCalledTimes(3);
    expect(mockScrape).toHaveBeenCalledWith(1, 'qwen3');
    expect(mockScrape).toHaveBeenCalledWith(2, 'qwen3');
    expect(mockScrape).toHaveBeenCalledWith(3, 'qwen3');
  });

  it('merges results and removes duplicates across pages', async () => {
    mockScrape
      .mockResolvedValueOnce(PAGE_1)
      .mockResolvedValueOnce(PAGE_2)
      .mockResolvedValueOnce(PAGE_3);

    const result = await search('qwen3', { from: 1, to: 3 });

    expect(result.pages.map((p) => p.model_id)).toEqual([
      'library/qwen3',
      'library/mistral',
      'library/llama3',
      'library/gemma3',
    ]);
  });

  it('sets page_range to the requested range', async () => {
    mockScrape.mockResolvedValue(PAGE_1);
    const result = await search('qwen3', { from: 3, to: 4 });
    expect(result.page_range).toEqual({ from: 3, to: 4 });
  });

  it('handles a single-element range identically to a page number', async () => {
    mockScrape.mockResolvedValue(PAGE_1);
    const byRange = await search('qwen3', { from: 2, to: 2 });
    expect(mockScrape).toHaveBeenCalledOnce();
    expect(mockScrape).toHaveBeenCalledWith(2, 'qwen3');
    expect(byRange.page_range).toEqual({ from: 2, to: 2 });
  });

  it('skips a failed page and returns partial results', async () => {
    mockScrape
      .mockResolvedValueOnce(PAGE_1)
      .mockRejectedValueOnce(new Error('HTTP 503'));

    const result = await search('qwen3', { from: 1, to: 2 });
    expect(result.pages).toEqual(PAGE_1);
  });

  it('returns results in ascending page-number order', async () => {
    mockScrape
      .mockResolvedValueOnce(PAGE_1)
      .mockResolvedValueOnce(PAGE_2)
      .mockResolvedValueOnce(PAGE_3);

    const result = await search('qwen3', { from: 1, to: 3 });
    expect(result.pages.map((p) => p.model_id)).toEqual([
      'library/qwen3',
      'library/mistral',
      'library/llama3',
      'library/gemma3',
    ]);
  });
});

// ─── maxRetries ───────────────────────────────────────────────────────────────
// search() called with a maxRetries argument: verifies retry-on-failure,
// drop after retry exhaustion, and independent per-page retry counters.
//
// maxRetries 인수로 search() 호출: 실패 시 재시도, 재시도 소진 후 페이지 제외,
// 페이지별 독립적인 재시도 카운터를 검증한다.

describe('search() — maxRetries', () => {
  it('retries a failing page and resolves on a subsequent attempt', async () => {
    mockScrape
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(PAGE_1);

    const result = await search('qwen3', 1, 2);
    expect(mockScrape).toHaveBeenCalledTimes(3);
    expect(result.pages).toEqual(PAGE_1);
  });

  it('drops the page after exhausting all retries', async () => {
    mockScrape.mockRejectedValue(new Error('HTTP 503'));

    const result = await search('qwen3', 1, 2);
    expect(mockScrape).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    expect(result.pages).toEqual([]);
  });

  it('retries each page independently', async () => {
    mockScrape
      .mockRejectedValueOnce(new Error('timeout')) // page 1 attempt 1 — fail
      .mockResolvedValueOnce(PAGE_2)               // page 2 attempt 1 — ok
      .mockResolvedValueOnce(PAGE_1);              // page 1 attempt 2 — ok

    const result = await search('qwen3', { from: 1, to: 2 }, 1);
    expect(result.pages.map((p) => p.model_id)).toEqual([
      'library/qwen3',
      'library/mistral',
      'library/llama3',
    ]);
  });
});
