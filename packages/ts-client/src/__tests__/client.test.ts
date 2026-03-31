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
    { http_url: 'https://ollama.com/library/qwen3' },
    { http_url: 'https://ollama.com/library/mistral' },
  ],
  page_id: 1,
  keyword: 'qwen3',
};

const MOCK_MODEL: unknown = {
  model_list: [
    { http_url: 'https://ollama.com/library/qwen3', id: 'qwen3:latest' },
    { http_url: 'https://ollama.com/library/qwen3', id: 'qwen3:4b' },
  ],
  default_model_id: 'qwen3:latest',
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
    expect(result.page_id).toBe(1);
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
});

// ─── getModel() ───────────────────────────────────────────────────────────────

describe('getModel()', () => {
  it('returns a parsed ModelList', async () => {
    vi.stubGlobal('fetch', mockFetch(MOCK_MODEL));
    const result = await new OllamaModelsClient().getModel('qwen3');
    expect(result.default_model_id).toBe('qwen3:latest');
    expect(result.model_list).toHaveLength(2);
    expect(result.model_list[0].id).toBe('qwen3:latest');
    expect(result.model_list[1].id).toBe('qwen3:4b');
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
});
