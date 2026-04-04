import { describe, it, expect, vi, afterEach } from 'vitest';
import { OllamaModelsClient, DEFAULT_BASE_URL } from '../client';

// ─── helpers ─────────────────────────────────────────────────────────────────

function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── fixtures ─────────────────────────────────────────────────────────────────

const MOCK_SEARCH: unknown = {
  pages: [
    { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' },
    { http_url: 'https://ollama.com/library/mistral', model_id: 'library/mistral' },
  ],
  page_range: 1,
  keyword: 'qwen3',
};

const MOCK_MODEL: unknown = {
  page_url: 'https://ollama.com/library/qwen3',
  id: 'library/qwen3',
  tags: ['qwen3:latest', 'qwen3:4b'],
  default_tag: 'qwen3:latest',
};

// ─── DEFAULT_BASE_URL ─────────────────────────────────────────────────────────

describe('DEFAULT_BASE_URL', () => {
  it('points to the official hosted instance', () => {
    expect(DEFAULT_BASE_URL).toBe('https://ollama-models-api.devcomfort.workers.dev');
  });
});

// ─── constructor ──────────────────────────────────────────────────────────────

describe('constructor', () => {
  it('uses DEFAULT_BASE_URL when called without arguments', async () => {
    const fetchMock = mockFetch(MOCK_SEARCH);
    vi.stubGlobal('fetch', fetchMock);
    await new OllamaModelsClient().search();
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain(DEFAULT_BASE_URL);
  });

  it('strips a trailing slash from a custom base URL', async () => {
    const fetchMock = mockFetch(MOCK_SEARCH);
    vi.stubGlobal('fetch', fetchMock);
    await new OllamaModelsClient('https://custom.example.com/').search();
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).not.toContain('//search');
  });
});

// ─── search() ────────────────────────────────────────────────────────────────

describe('search()', () => {
  it('returns a parsed SearchResult', async () => {
    vi.stubGlobal('fetch', mockFetch(MOCK_SEARCH));
    const result = await new OllamaModelsClient().search('qwen3', 1);
    expect(result.keyword).toBe('qwen3');
    expect(result.page_range).toBe(1);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].http_url).toBe('https://ollama.com/library/qwen3');
  });

  it('sends keyword and page as query parameters', async () => {
    const fetchMock = mockFetch(MOCK_SEARCH);
    vi.stubGlobal('fetch', fetchMock);
    await new OllamaModelsClient('https://api.test').search('mistral', 3);
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('q=mistral');
    expect(url).toContain('page=3');
  });

  it('omits the q parameter when keyword is empty', async () => {
    const fetchMock = mockFetch(MOCK_SEARCH);
    vi.stubGlobal('fetch', fetchMock);
    await new OllamaModelsClient('https://api.test').search('', 1);
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).not.toContain('q=');
  });

  it('hits the /search endpoint', async () => {
    const fetchMock = mockFetch(MOCK_SEARCH);
    vi.stubGlobal('fetch', fetchMock);
    await new OllamaModelsClient('https://api.test').search('qwen3');
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('/search');
  });

  it('throws with the HTTP status on a non-OK response', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 500));
    await expect(new OllamaModelsClient().search('qwen3')).rejects.toThrow(
      'HTTP 500',
    );
  });

  it('throws when the response does not match the SearchResult schema', async () => {
    vi.stubGlobal('fetch', mockFetch({ pages: 'not-an-array', page_range: 1, keyword: '' }));
    await expect(new OllamaModelsClient().search()).rejects.toThrow(
      'SearchResult.pages: expected array',
    );
  });

  it('throws when a ModelPage entry is missing model_id', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        pages: [{ http_url: 'https://ollama.com/library/qwen3' }],
        page_range: 1,
        keyword: 'qwen3',
      }),
    );
    await expect(new OllamaModelsClient().search('qwen3')).rejects.toThrow(
      'SearchResult.pages[0].model_id: expected string',
    );
  });
});

// ─── getModel() ───────────────────────────────────────────────────────────────

describe('getModel()', () => {
  it('returns a parsed ModelTags', async () => {
    vi.stubGlobal('fetch', mockFetch(MOCK_MODEL));
    const result = await new OllamaModelsClient().getModel('qwen3');
    expect(result.page_url).toBe('https://ollama.com/library/qwen3');
    expect(result.id).toBe('library/qwen3');
    expect(result.tags).toEqual(['qwen3:latest', 'qwen3:4b']);
    expect(result.default_tag).toBe('qwen3:latest');
  });

  it('sends the model name as a query parameter', async () => {
    const fetchMock = mockFetch(MOCK_MODEL);
    vi.stubGlobal('fetch', fetchMock);
    await new OllamaModelsClient('https://api.test').getModel('qwen3');
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('name=qwen3');
  });

  it('hits the /model endpoint', async () => {
    const fetchMock = mockFetch(MOCK_MODEL);
    vi.stubGlobal('fetch', fetchMock);
    await new OllamaModelsClient('https://api.test').getModel('qwen3');
    const url: string = fetchMock.mock.calls[0][0];
    expect(url).toContain('/model');
  });

  it('throws with the HTTP status on a non-OK response', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 404));
    await expect(new OllamaModelsClient().getModel('nonexistent')).rejects.toThrow(
      'HTTP 404',
    );
  });

  it('throws when the response does not match the ModelTags schema', async () => {
    vi.stubGlobal('fetch', mockFetch({ page_url: 'https://ollama.com/library/qwen3', id: 'library/qwen3', tags: null, default_tag: null }));
    await expect(new OllamaModelsClient().getModel('qwen3')).rejects.toThrow(
      'ModelTags.tags: expected array',
    );
  });

  it('throws when a tag entry is not a string', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        page_url: 'https://ollama.com/library/qwen3',
        id: 'library/qwen3',
        tags: [42],
        default_tag: null,
      }),
    );
    await expect(new OllamaModelsClient().getModel('qwen3')).rejects.toThrow(
      'ModelTags.tags[0]: expected string',
    );
  });
});
