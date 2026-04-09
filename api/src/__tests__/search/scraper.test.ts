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
  // === shared fixture URLs ===
  const SEARCH_URL = `${OLLAMA_BASE}/search?page=1&q=${TEST_MODEL}`;
  const NO_RESULTS_URL = `${OLLAMA_BASE}/search?page=1&q=${NO_RESULTS_MODEL}`;

  // 최초 1번은 미리 실행하여 데이터를 저장함 (warming)
  beforeAll(async () => {
    await fetchCached(SEARCH_URL);
    await fetchCached(NO_RESULTS_URL);
  });

  // Q. 최소한 1개의 URL은 반환하는가.
  it('returns at least one model URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    expect(pages.length).toBeGreaterThan(0);
  });

  // Q. 모든 결과가 올바른 형태의 http_url을 가지는가?
  // NOTE: 유효한 URL은 https://ollama.com/로 시작하는 URL을 말한다.
  it('every result has a well-formed http_url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    for (const p of pages) {
      expect(p.http_url.startsWith('https://ollama.com/')).toBe(true);
    }
  });

  // Q. 모든 결과가 유효한 model_id를 가지는가?
  // NOTE: 유효한 model_id는 username/modelname 형태이다. 예: library/qwen3, alibayram/smollm3
  it('every result has a valid model_id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    for (const p of pages) {
      expect(p.model_id).toMatch(/^[^/]+\/.+/);
    }
  });

  // Q. 중복된 http_url이 없는가?
  it('returns no duplicate http_urls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    const urls = pages.map((p) => p.http_url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  // Q. 결과 URL이 모델 경로이고 네비게이션 링크가 아닌가?
  // NOTE: 모델 경로는 https://ollama.com/{namespace}/{name} 형태이며,
  // 페이지 네비게이션(예: pagination) 링크는 제외되어야 한다.
  it('result URLs are model paths, not navigation links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));
    const pages = await scrapeSearchPage(1, TEST_MODEL);
    for (const p of pages) {
      expect(p.http_url).toMatch(/^https:\/\/ollama\.com\/[^/]+\/[^/]+$/);
    }
  });

  // Q. 페이지 번호와 키워드를 Ollama 검색 URL에 올바르게 전달하는가?
  it('passes page number and keyword to the Ollama search URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    });
    vi.stubGlobal('fetch', fetchMock);
    await scrapeSearchPage(3, TEST_MODEL);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('page=3');
    expect(calledUrl).toContain(`q=${TEST_MODEL}`);
  });

  // Q. 키워드가 비어있을 때 q 파라미터를 추가하지 않는가?
  it('does not append q param when keyword is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    });
    vi.stubGlobal('fetch', fetchMock);
    await scrapeSearchPage(1, '');
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('q=');
  });

  // Q. 선택자가 카드와 일치하지 않을 때 설명적인 에러를 던지는가?
  // NOTE: 선택자 'a.group.w-full'은 ollama.com 검색 결과 페이지의 모델 카드를 가리킨다.
  // 이 선택자를 찾을 수 없으면 ollama.com HTML 구조가 변경되었을 가능성이 높다.
  it('throws a descriptive error when the selector matches no cards', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(NO_RESULTS_URL)!,
    }));
    await expect(scrapeSearchPage(1, 'zzz-no-match')).rejects.toThrow(
      "selector 'a.group.w-full' may no longer match",
    );
  });

  // Q. Ollama이 2xx가 아닌 상태를 반환할 때 에러를 던지는가?
  it('throws when Ollama returns a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));
    await expect(scrapeSearchPage(1, '')).rejects.toThrow('HTTP 503');
  });
});
