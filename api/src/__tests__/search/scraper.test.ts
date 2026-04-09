import { beforeAll, afterEach, describe, it, expect, vi } from 'vitest';
import { scrapeSearchPage } from '../../search/scraper';
import { OLLAMA_BASE, FETCH_HEADERS } from '../../constants';
import { TEST_MODEL, NO_RESULTS_MODEL } from '../shared-test-config';

// === in-memory fetch cache ===
// Fetches each URL at most once per test run. Avoids hammering ollama.com when
// multiple tests reuse the same page, while keeping tests free of filesystem I/O.
//
// 테스트 실행당 각 URL을 최대 한 번만 fetch한다. 여러 테스트가 같은 페이지를 재사용할 때
// ollama.com에 반복 요청하지 않으면서 파일 시스템 의존성도 없앤다.

const htmlCache = new Map<string, string>();

async function fetchCached(url: string): Promise<string> {
  if (htmlCache.has(url)) return htmlCache.get(url)!;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Failed to fetch fixture: HTTP ${res.status} ${url}`);
  const html = await res.text();
  htmlCache.set(url, html);
  return html;
}

// === mock helper + teardown ===

// Restores the real global fetch after each test to ensure that stubs from
// one test case do not persist into the next.
//
// 각 테스트 후 실제 전역 fetch를 복원하여 한 테스트의 스텁이 다음 테스트에
// 남아있지 않도록 한다.
afterEach(() => {
  vi.unstubAllGlobals();
});

// === scrapeSearchPage ===
// Covers: result shape (http_url, model_id), deduplication, navigation-segment
// filtering, URL construction (page number + keyword), empty-keyword omission,
// selector-failure descriptive error message, and HTTP error propagation.
// Real HTML is loaded in beforeAll — a selector change on ollama.com breaks
// these tests before the integration suite runs.
//
// 검증 범위: 결과 형태(http_url, model_id), 중복 제거, 탐색 세그먼트 필터링,
// URL 생성(페이지 번호 + 키워드), 빈 키워드 생략, 선택자 실패 시 설명 에러 메시지,
// HTTP 에러 전파. beforeAll에서 실제 HTML을 로드하므로 ollama.com의 선택자 변경 시
// 인티그레이션 스위트보다 먼저 실패한다.

describe('scrapeSearchPage', () => {
  // === shared fixtures ===
  // Fetch real HTML from ollama.com once, cache in memory, reuse across tests.
  // SEARCH_HTML: normal results page (keyword: TEST_MODEL)
  // NO_RESULTS_HTML: empty results page (keyword: NO_RESULTS_MODEL — intentionally fake)
  // All tests run against these cached HTML copies without hitting overtime.
  //
  // ollama.com에서 실제 HTML을 한 번 가져와 메모리 캐시에 저장한 후 모든 테스트에서 재사용.
  // SEARCH_HTML: 정상 결과 페이지 (키워드: TEST_MODEL)
  // NO_RESULTS_HTML: 빈 결과 페이지 (키워드: NO_RESULTS_MODEL — 의도적으로 가짜)
  // 모든 테스트가 캐시된 HTML을 사용하므로 네트워크 요청 없이 실행.
  let SEARCH_HTML: string;
  let NO_RESULTS_HTML: string;

  beforeAll(async () => {
    SEARCH_HTML = await fetchCached(`${OLLAMA_BASE}/search?page=1&q=${TEST_MODEL}`);
    NO_RESULTS_HTML = await fetchCached(`${OLLAMA_BASE}/search?page=1&q=${NO_RESULTS_MODEL}`);
  });

  it('returns at least one model URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SEARCH_HTML,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    expect(pages.length).toBeGreaterThan(0);
  });

  it('every result has a well-formed http_url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SEARCH_HTML,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    for (const p of pages) {
      expect(p.http_url).toMatch(/^https:\/\/ollama\.com\//);
    }
  });

  it('every result has a valid model_id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SEARCH_HTML,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    for (const p of pages) {
      expect(p.model_id).toMatch(/^[^/]+\/.+/);
    }
  });

  it('returns no duplicate http_urls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SEARCH_HTML,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    const urls = pages.map((p) => p.http_url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('result URLs are model paths, not navigation links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SEARCH_HTML,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    for (const p of pages) {
      expect(p.http_url).toMatch(/^https:\/\/ollama\.com\/[^/]+\/[^/]+$/);
    }
  });

  it('passes page number and keyword to the Ollama search URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SEARCH_HTML,
    });
    vi.stubGlobal('fetch', fetchMock);
    await scrapeSearchPage(3, TEST_MODEL);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('page=3');
    expect(calledUrl).toContain(`q=${TEST_MODEL}`);
  });

  it('does not append q param when keyword is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => SEARCH_HTML,
    });
    vi.stubGlobal('fetch', fetchMock);
    await scrapeSearchPage(1, '');
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('q=');
  });

  it('throws a descriptive error when the selector matches no cards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => NO_RESULTS_HTML,
    }));
    await expect(scrapeSearchPage(1, 'zzz-no-match')).rejects.toThrow(
      "selector 'a.group.w-full' may no longer match",
    );
  });

  it('throws when Ollama returns a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));
    await expect(scrapeSearchPage(1, '')).rejects.toThrow('HTTP 503');
  });
});
