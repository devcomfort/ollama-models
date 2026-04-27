import { beforeAll, afterEach, describe, it, expect, vi } from 'vitest';
import { scrapeSearchPage } from '../../search/scraper';
import { ParseError, UpstreamError } from '../../errors';
import { TEST_MODEL, NO_RESULTS_MODEL } from '../shared-test-config';

const TEST_ENV = {
  OLLAMA_BASE: 'https://ollama.com',
  OLLAMA_USER_AGENT: 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  OLLAMA_ACCEPT: 'text/html,application/xhtml+xml',
  OLLAMA_ACCEPT_LANGUAGE: 'en-US,en;q=0.9',
};

// === in-memory fetch cache ===
// Fetches each URL at most once per test run. Avoids hammering ollama.com when
// multiple tests reuse the same page, while keeping tests free of filesystem I/O.
//
// 테스트 실행당 각 URL을 최대 한 번만 fetch한다. 여러 테스트가 같은 페이지를 재사용할 때
// ollama.com에 반복 요청하지 않으면서 파일 시스템 의존성도 없앤다.

const htmlCache = new Map<string, string>();

async function fetchCached(url: string): Promise<string> {
  if (htmlCache.has(url)) return htmlCache.get(url)!;
  const res = await fetch(url, {
    headers: {
      'User-Agent': TEST_ENV.OLLAMA_USER_AGENT,
      Accept: TEST_ENV.OLLAMA_ACCEPT,
      'Accept-Language': TEST_ENV.OLLAMA_ACCEPT_LANGUAGE,
    },
  });
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

// [scrapeSearchPage]
// scrapeSearchPage는 ollama.com 검색 결과 페이지를 fetch·파싱하여
// ModelPage[]를 반환하는 스크래퍼 함수다.
//
// [관련 스키마]
// ModelPage는 개별 모델 카드 하나를 나타내며 두 필드로 구성된다.
// - http_url: 모델 페이지의 절대 URL (https://ollama.com/library/qwen3)
// - model_id: {namespace}/{name} 형태의 모델 경로 (library/qwen3, alibayram/smollm3)
//
// 반환된 ModelPage[]는 GET /search 응답 타입인 SearchResult의 pages 필드에
// 그대로 담긴다. SearchResult는 { pages, page_range, keyword }로 구성되며,
// 이 함수는 그 중 pages만 채우는 역할을 한다.
//
// [테스트 목적]
// HTML 파싱 결과를 검증 없이 응답에 노출하는 구조이므로, 반환값의 형태
// 유효성·비모델 링크 필터링·URL 직렬화·에러 전파를 빠짐없이 확인한다.
//
// [전제 조건 및 시나리오]
// 실제 HTML을 beforeAll에서 캐시하고 각 케이스에서 fetch를 스텁해 재사용한다.
// 선택자가 변경되면 인티그레이션 스위트보다 이 스위트가 먼저 실패한다.
//
// [픽스처에 대하여]
// htmlCache Map을 이용해 URL당 한 번만 실제 fetch를 수행하고 이후엔 재사용.
//
// Things below verify whether each ModelPage[] field meets the type spec:
// - 최소 1개 이상 반환하는가?
// - http_url이 https://ollama.com/로 시작하는가?
// - model_id가 username/modelname 형태인가?
// - 중복된 http_url이 없는가?
// Things below verify whether non-model links (pagination etc.) are filtered out:
// - pagination 링크가 아닌 모델 경로만 포함하는가?
// Things below verify whether args (page, keyword) are serialized to the query string:
// - 페이지 번호와 키워드가 올바르게 포함되는가?
// - 빈 키워드일 때 q 파라미터가 생략되는가?
// Things below verify whether errors carry diagnostic messages:
// - 선택자 불일치 시 설명적인 에러를 던지는가?
// - HTTP 오류 시 상태 코드를 포함한 에러를 던지는가?

describe('scrapeSearchPage', () => {
  // === shared fixture URLs ===
  const SEARCH_URL = `${TEST_ENV.OLLAMA_BASE}/search?page=1&q=${TEST_MODEL}`;
  const NO_RESULTS_URL = `${TEST_ENV.OLLAMA_BASE}/search?page=1&q=${NO_RESULTS_MODEL}`;

  // 최초 1번은 미리 실행하여 데이터를 저장함 (warming)
  beforeAll(async () => {
    await fetchCached(SEARCH_URL);
    await fetchCached(NO_RESULTS_URL);
  });

  // Q. 최소한 1개의 URL은 반환하는가.
  it('returns at least one model URL', async () => {
    // 캐시된 정상 결과 HTML 반환하도록 fetch를 스텁
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));

    // 스크래퍼 실행 및 검증 (최소 1개 이상인지 확인)
    const pages = await scrapeSearchPage(1, TEST_MODEL, TEST_ENV);
    expect(pages.length).toBeGreaterThan(0);
  });

  // Q. 모든 결과가 올바른 형태의 http_url을 가지는가?
  // NOTE: 유효한 URL은 https://ollama.com/로 시작하는 URL을 말한다.
  //   유효: https://ollama.com/library/qwen3
  //   제외: http://ollama.com/library/qwen3 (http), https://huggingface.co/model (다른 도메인)
  it('every result has a well-formed http_url', async () => {
    // 캐시된 정상 결과 HTML 반환하도록 fetch를 스텁
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));

    // 스크래퍼 실행 및 검증 (모든 항목을 순회하여 각각 확인)
    const pages = await scrapeSearchPage(1, TEST_MODEL, TEST_ENV);
    for (const p of pages) {
      expect(p.http_url.startsWith('https://ollama.com/')).toBe(true);
    }
  });

  // Q. 모든 결과가 유효한 model_id를 가지는가?
  // NOTE: 유효한 model_id는 username/modelname 형태이다. 예: library/qwen3, alibayram/smollm3
  it('every result has a valid model_id', async () => {
    // 캐시된 정상 결과 HTML 반환하도록 fetch를 스텁
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));

    // 스크래퍼 실행 및 검증 (모든 항목을 순회하여 각각 확인)
    const pages = await scrapeSearchPage(1, TEST_MODEL, TEST_ENV);
    for (const p of pages) {
      expect(p.model_id).toMatch(/^[^/]+\/.+/);
    }
  });

  // Q. 중복된 http_url이 없는가?
  it('returns no duplicate http_urls', async () => {
    // 캐시된 정상 결과 HTML 반환하도록 fetch를 스텁
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));

    // 스크래퍼 실행 및 검증 (URL 목록을 Set으로 변환해 원본 배열과 크기 비교)
    const pages = await scrapeSearchPage(1, TEST_MODEL, TEST_ENV);
    const urls = pages.map((p) => p.http_url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  // Q. 결과 URL이 모델 경로이고 네비게이션 링크가 아닌가?
  // NOTE: 모델 경로는 https://ollama.com/{namespace}/{name} 형태이며,
  // 페이지 네비게이션(예: pagination) 링크는 제외되어야 한다.
  //   유효: https://ollama.com/library/qwen3, https://ollama.com/alibayram/smollm3
  //   제외: https://ollama.com/search?page=2
  it('result URLs are model paths, not navigation links', async () => {
    // 캐시된 정상 결과 HTML 반환하도록 fetch를 스텁
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    }));

    // 스크래퍼 실행 및 검증 (모든 항목을 순회하여 각각 확인)
    const pages = await scrapeSearchPage(1, TEST_MODEL, TEST_ENV);
    for (const p of pages) {
      expect(p.http_url).toMatch(/^https:\/\/ollama\.com\/[^/]+\/[^/]+$/);
    }
  });

  // Q. 페이지 번호와 키워드를 Ollama 검색 URL에 올바르게 전달하는가?
  // NOTE: scrapeSearchPage(3, 'qwen3') 호출 시 생성되는 URL 예시:
  //   https://ollama.com/search?page=3&q=qwen3
  it('passes page number and keyword to the Ollama search URL', async () => {
    // 호출된 URL을 나중에 꺼낼 수 있도록 mock 참조를 보관
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    });
    vi.stubGlobal('fetch', fetchMock);

    // 스크래퍼 실행 및 검증 (호출된 URL에 page, keyword가 포함되는지 확인)
    await scrapeSearchPage(3, TEST_MODEL, TEST_ENV);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('page=3');
    expect(calledUrl).toContain(`q=${TEST_MODEL}`);
  });

  // Q. 키워드가 비어있을 때 q 파라미터를 추가하지 않는가?
  // NOTE: scrapeSearchPage(1, '') 호출 시 생성되는 URL 예시:
  //   올바름: https://ollama.com/search?page=1
  //   잘못됨: https://ollama.com/search?page=1&q=
  it('does not append q param when keyword is empty', async () => {
    // 호출된 URL을 나중에 꺼낼 수 있도록 mock 참조를 보관
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(SEARCH_URL)!,
    });
    vi.stubGlobal('fetch', fetchMock);

    // 스크래퍼 실행 및 검증 (호출된 URL에 q 파라미터가 없는지 확인)
    await scrapeSearchPage(1, '', TEST_ENV);
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('q=');
  });

  // Q. 선택자가 카드와 일치하지 않을 때 설명적인 에러를 던지는가?
  // NOTE: 선택자 'a.group.w-full'은 ollama 검색 결과 페이지의 모델 카드를 가리킨다.
  // 이 선택자를 찾을 수 없으면 ollama.com HTML 구조가 변경되었을 가능성이 높다.
  it('throws a descriptive error when the selector matches no cards', async () => {
    // 검색 결과가 없는 페이지 HTML로 스텁 (실제 빈 결과 페이지)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => htmlCache.get(NO_RESULTS_URL)!,
    }));

    // 스크래퍼 실행 및 검증 (특정 에러 메시지와 함께 throw 여부 확인)
    await expect(scrapeSearchPage(1, 'zzz-no-match', TEST_ENV)).rejects.toThrow(
      "selector 'a.group.w-full' may no longer match",
    );
    await expect(scrapeSearchPage(1, 'zzz-no-match', TEST_ENV)).rejects.toBeInstanceOf(ParseError);
  });

  // Q. Ollama이 200이 아닌 상태를 반환할 때 에러를 던지는가?
  it('throws when Ollama returns a non-2xx status', async () => {
    // ok: false로 HTTP 오류 상황을 시뮬레이션
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    // 스크래퍼 실행 및 검증 (HTTP 상태 코드를 포함한 에러 throw 여부 확인)
    await expect(scrapeSearchPage(1, '', TEST_ENV)).rejects.toThrow('HTTP 503');
    await expect(scrapeSearchPage(1, '', TEST_ENV)).rejects.toBeInstanceOf(UpstreamError);
  });

  // Q. Ollama이 2xx가 아닌 상태를 반환할 때 에러를 던지는가?
  it('throws when Ollama returns a non-2xx status', async () => {
    // ok: false로 HTTP 오류 상황을 시뮬레이션
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }));

    // 스크래퍼 실행 및 검증 (HTTP 상태 코드를 포함한 에러 throw 여부 확인)
    await expect(scrapeSearchPage(1, '', TEST_ENV)).rejects.toThrow('HTTP 503');
  });
});
