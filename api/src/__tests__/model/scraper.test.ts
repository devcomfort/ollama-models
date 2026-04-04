import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapeModelPage } from '../../model/scraper';
import type { ModelPage } from '../../search/types';

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

// ─── scrapeModelPage ──────────────────────────────────────────────────────────

describe('scrapeModelPage', () => {
  it('returns pull-ready tags for a library model (no library/ prefix)', async () => {
    const html = '<a href="/library/mistral:latest" class="md:hidden flex flex-col space-y-[6px] group">x</a>';
    vi.stubGlobal('fetch', mockFetch(html));
    const page: ModelPage = { http_url: 'https://ollama.com/library/mistral', model_id: 'library/mistral' };
    const result = await scrapeModelPage(page);
    expect(result.page_url).toBe('https://ollama.com/library/mistral');
    expect(result.id).toBe('library/mistral');
    expect(result.tags).toEqual(['mistral:latest']);
    expect(result.default_tag).toBe('mistral:latest');
  });

  it('returns pull-ready tags for a community model (keeps username/ prefix)', async () => {
    const html = '<a href="/RogerBen/custom-model:v1" class="md:hidden flex flex-col space-y-[6px] group">v1</a>';
    vi.stubGlobal('fetch', mockFetch(html));
    const page: ModelPage = { http_url: 'https://ollama.com/RogerBen/custom-model', model_id: 'RogerBen/custom-model' };
    const result = await scrapeModelPage(page);
    expect(result.page_url).toBe('https://ollama.com/RogerBen/custom-model');
    expect(result.id).toBe('RogerBen/custom-model');
    expect(result.tags).toEqual(['RogerBen/custom-model:v1']);
    expect(result.default_tag).toBeNull();
  });

  it('throws a descriptive error when the selector matches no tag cards', async () => {
    const html = '<div>No tags</div>';
    vi.stubGlobal('fetch', mockFetch(html));
    const page: ModelPage = { http_url: 'https://ollama.com/library/unknown-model', model_id: 'library/unknown-model' };
    await expect(scrapeModelPage(page)).rejects.toThrow(
      "selector 'a[class*=\"flex flex-col\"]' may no longer match",
    );
  });

  it('deduplicates pull-ready tag IDs', async () => {
    const html = `
      <a href="/library/qwen3:latest" class="md:hidden flex flex-col space-y-[6px] group">latest</a>
      <a href="/library/qwen3:latest" class="group-hover:underline">latest</a>
      <a href="/library/qwen3:4b" class="md:hidden flex flex-col space-y-[6px] group">4b</a>
    `;
    vi.stubGlobal('fetch', mockFetch(html));
    const page: ModelPage = { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' };
    const { tags } = await scrapeModelPage(page);
    expect(tags).toEqual(['qwen3:latest', 'qwen3:4b']);
  });

  it('throws when Ollama returns a non-2xx status', async () => {
    vi.stubGlobal('fetch', mockFetch('', 404));
    const page: ModelPage = { http_url: 'https://ollama.com/library/nonexistent', model_id: 'library/nonexistent' };
    await expect(scrapeModelPage(page)).rejects.toThrow('HTTP 404');
  });
});
