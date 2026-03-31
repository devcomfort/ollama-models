import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeSearchPage, scrapeModelPage } from '../scraper';

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
  <a href="/library/qwen3">qwen3</a>
  <a href="/library/mistral">mistral</a>
  <a href="/library/qwen3">duplicate</a>
`;

const USER_MODELS_HTML = `
  <a href="/library/qwen3">qwen3</a>
  <a href="/RogerBen/custom-model">custom</a>
`;

const SKIP_SEGMENTS_HTML = `
  <a href="/search/guide">skip (search)</a>
  <a href="/docs/api">skip (docs)</a>
  <a href="/library/valid-model">keep</a>
`;

const TAGS_HTML = `
  <a href="/library/qwen3:latest">latest</a>
  <a href="/library/qwen3:4b">4b</a>
  <a href="/library/qwen3:8b">8b</a>
`;

// ─── scrapeSearchPage ─────────────────────────────────────────────────────────

describe('scrapeSearchPage', () => {
  it('returns unique library model URLs', async () => {
    vi.stubGlobal('fetch', mockFetch(LIBRARY_MODELS_HTML));
    const urls = await scrapeSearchPage(1, 'qwen');
    expect(urls).toEqual([
      'https://ollama.com/library/qwen3',
      'https://ollama.com/library/mistral',
    ]);
  });

  it('includes user-contributed model URLs', async () => {
    vi.stubGlobal('fetch', mockFetch(USER_MODELS_HTML));
    const urls = await scrapeSearchPage(1, '');
    expect(urls).toContain('https://ollama.com/RogerBen/custom-model');
  });

  it('filters out known navigation segments', async () => {
    vi.stubGlobal('fetch', mockFetch(SKIP_SEGMENTS_HTML));
    const urls = await scrapeSearchPage(1, '');
    expect(urls).toEqual(['https://ollama.com/library/valid-model']);
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

  it('returns an empty array when no model links are present', async () => {
    vi.stubGlobal('fetch', mockFetch('<p>No results</p>'));
    const urls = await scrapeSearchPage(1, 'zzz-no-match');
    expect(urls).toEqual([]);
  });

  it('throws when Ollama returns a non-2xx status', async () => {
    vi.stubGlobal('fetch', mockFetch('', 503));
    await expect(scrapeSearchPage(1, '')).rejects.toThrow('HTTP 503');
  });
});

// ─── scrapeModelPage ──────────────────────────────────────────────────────────

describe('scrapeModelPage', () => {
  it('returns tags and modelPageUrl for a short model name', async () => {
    vi.stubGlobal('fetch', mockFetch(TAGS_HTML));
    const { tags, modelPageUrl } = await scrapeModelPage('qwen3');
    expect(tags).toEqual(['latest', '4b', '8b']);
    expect(modelPageUrl).toBe('https://ollama.com/library/qwen3');
  });

  it('handles explicit library/ prefix', async () => {
    vi.stubGlobal('fetch', mockFetch('<a href="/library/mistral:latest">x</a>'));
    const { tags, modelPageUrl } = await scrapeModelPage('library/mistral');
    expect(tags).toEqual(['latest']);
    expect(modelPageUrl).toBe('https://ollama.com/library/mistral');
  });

  it('handles user model path', async () => {
    vi.stubGlobal('fetch', mockFetch('<a href="/RogerBen/custom-model:v1">v1</a>'));
    const { tags, modelPageUrl } = await scrapeModelPage('RogerBen/custom-model');
    expect(tags).toEqual(['v1']);
    expect(modelPageUrl).toBe('https://ollama.com/RogerBen/custom-model');
  });

  it('handles full https://ollama.com URL as input', async () => {
    vi.stubGlobal('fetch', mockFetch('<a href="/library/qwen3:latest">x</a>'));
    const { modelPageUrl } = await scrapeModelPage('https://ollama.com/library/qwen3');
    expect(modelPageUrl).toBe('https://ollama.com/library/qwen3');
  });

  it('strips trailing /tags suffix from input', async () => {
    vi.stubGlobal('fetch', mockFetch('<a href="/library/qwen3:latest">x</a>'));
    const { modelPageUrl } = await scrapeModelPage('library/qwen3/tags');
    expect(modelPageUrl).toBe('https://ollama.com/library/qwen3');
  });

  it('falls back to ["latest"] when no tags are found', async () => {
    vi.stubGlobal('fetch', mockFetch('<div>No tags</div>'));
    const { tags } = await scrapeModelPage('unknown-model');
    expect(tags).toEqual(['latest']);
  });

  it('deduplicates tag names', async () => {
    const html = `
      <a href="/library/qwen3:latest">latest</a>
      <a href="/library/qwen3:latest">dup</a>
      <a href="/library/qwen3:4b">4b</a>
    `;
    vi.stubGlobal('fetch', mockFetch(html));
    const { tags } = await scrapeModelPage('qwen3');
    expect(tags).toEqual(['latest', '4b']);
  });

  it('throws when Ollama returns a non-2xx status', async () => {
    vi.stubGlobal('fetch', mockFetch('', 404));
    await expect(scrapeModelPage('nonexistent')).rejects.toThrow('HTTP 404');
  });
});
