import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeSearchPage } from '../../search/scraper';

function mockFetch(html: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  });
}

// Restores the real global fetch after each test to ensure that stubs from
// one test case do not persist into the next.
//
// 각 테스트 후 실제 전역 fetch를 복원하여 한 테스트의 스텁이 다음 테스트에
// 남아있지 않도록 한다.
afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── fixtures ────────────────────────────────────────────────────────────────
// Minimal HTML strings containing only the elements scrapeSearchPage targets.
// LIBRARY_MODELS_HTML: two unique models + one deliberate duplicate → tests
//   deduplication. USER_MODELS_HTML: library + community link → tests inclusion
//   of user-contributed models. SKIP_SEGMENTS_HTML: nav links that should be
//   filtered out by the segment blocklist, plus one valid model link.
//
// scrapeSearchPage가 대상으로 하는 요소만 포함하는 최소 HTML 문자열.
// LIBRARY_MODELS_HTML: 고유 모델 2개 + 의도적 중복 1개 → 중복 제거 테스트.
// USER_MODELS_HTML: 라이브러리 + 커뮤니티 링크 → 사용자 기여 모델 포함 테스트.
// SKIP_SEGMENTS_HTML: 세그먼트 블록리스트로 필터링되어야 하는 탐색 링크와
//   유효한 모델 링크 1개.
const LIBRARY_MODELS_HTML = `
  <a href="/library/qwen3" class="group w-full">qwen3</a>
  <a href="/library/mistral" class="group w-full">mistral</a>
  <a href="/library/qwen3" class="group w-full">duplicate</a>
`;

const USER_MODELS_HTML = `
  <a href="/library/qwen3" class="group w-full">qwen3</a>
  <a href="/RogerBen/custom-model" class="group w-full">custom</a>
`;

const SKIP_SEGMENTS_HTML = `
  <a href="/search/guide">skip (search)</a>
  <a href="/docs/api">skip (docs)</a>
  <a href="/library/valid-model" class="group w-full">keep</a>
`;

// ─── scrapeSearchPage ─────────────────────────────────────────────────────────
// Covers: deduplication, user-model inclusion, navigation-segment filtering,
// URL construction (page number + keyword), empty-keyword omission, selector-
// failure descriptive error message, and HTTP error propagation.
//
// 검증 범위: 중복 제거, 사용자 모델 포함, 탐색 세그먼트 필터링,
// URL 생성(페이지 번호 + 키워드), 빈 키워드 생략, 선택자 실패 시 설명 에러 메시지,
// HTTP 에러 전파.

describe('scrapeSearchPage', () => {
  it('returns unique library model URLs', async () => {
    vi.stubGlobal('fetch', mockFetch(LIBRARY_MODELS_HTML));
    const pages = await scrapeSearchPage(1, 'qwen');
    expect(pages).toEqual([
      { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' },
      { http_url: 'https://ollama.com/library/mistral', model_id: 'library/mistral' },
    ]);
  });
  it('includes user-contributed model URLs', async () => {
    vi.stubGlobal('fetch', mockFetch(USER_MODELS_HTML));
    const pages = await scrapeSearchPage(1, '');
    expect(pages.map((p) => p.http_url)).toContain('https://ollama.com/RogerBen/custom-model');
  });

  it('filters out known navigation segments', async () => {
    vi.stubGlobal('fetch', mockFetch(SKIP_SEGMENTS_HTML));
    const pages = await scrapeSearchPage(1, '');
    expect(pages).toEqual([
      { http_url: 'https://ollama.com/library/valid-model', model_id: 'library/valid-model' },
    ]);
  });

  it('passes page number and keyword to the Ollama search URL', async () => {
    const fetchMock = mockFetch(LIBRARY_MODELS_HTML);
    vi.stubGlobal('fetch', fetchMock);
    await scrapeSearchPage(3, 'mistral');
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('page=3');
    expect(calledUrl).toContain('q=mistral');
  });

  it('does not append q param when keyword is empty', async () => {
    const fetchMock = mockFetch(LIBRARY_MODELS_HTML);
    vi.stubGlobal('fetch', fetchMock);
    await scrapeSearchPage(1, '');
    const calledUrl: string = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain('q=');
  });

  it('throws a descriptive error when the selector matches no cards', async () => {
    vi.stubGlobal('fetch', mockFetch('<p>No results</p>'));
    await expect(scrapeSearchPage(1, 'zzz-no-match')).rejects.toThrow(
      "selector 'a.group.w-full' may no longer match",
    );
  });

  it('throws when Ollama returns a non-2xx status', async () => {
    vi.stubGlobal('fetch', mockFetch('', 503));
    await expect(scrapeSearchPage(1, '')).rejects.toThrow('HTTP 503');
  });
});
