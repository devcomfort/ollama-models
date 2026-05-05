import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../../lib/fetch';

describe('fetchWithRetry', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the response on first success', async () => {
    const html = '<html>ok</html>';
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(html, { status: 200 }));

    const res = await fetchWithRetry('https://ollama.com/search?q=test');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(html);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network failure and succeeds on second attempt', async () => {
    const html = '<html>ok</html>';
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValue(new Response(html, { status: 200 }));

    const res = await fetchWithRetry('https://ollama.com/search?q=test', undefined, { retryDelayMs: 0 });
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('retries up to maxRetries then throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'));

    await expect(
      fetchWithRetry('https://ollama.com/model/test', undefined, { maxRetries: 1, retryDelayMs: 0 }),
    ).rejects.toThrow('timeout');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it('does NOT retry on non-2xx responses (returns the response as-is)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('server error', { status: 502 }));

    const res = await fetchWithRetry('https://ollama.com/broken');
    expect(res.status).toBe(502);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // no retry
  });

  it('passes init headers to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));

    await fetchWithRetry('https://ollama.com/search', {
      headers: { 'User-Agent': 'test/1.0', Accept: 'text/html' },
    });

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].headers).toEqual({ 'User-Agent': 'test/1.0', Accept: 'text/html' });
  });

  it('defaults to 3 total attempts (maxRetries=2)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(fetchWithRetry('https://ollama.com/nope', undefined, { retryDelayMs: 0 })).rejects.toThrow('fail');
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
