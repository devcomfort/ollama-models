import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeSearchPage } from '../../search/scraper';

function mockFetch(html: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => html,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── fixtures ────────────────────────────────────────────────────────────────

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
