/**
 * Regression tests for the ci-server fetch interceptor.
 *
 * The fetch interceptor overrides globalThis.fetch to cache ollama.com
 * HTML responses. A previous bug (commit 757bf02) caused infinite
 * recursion when the overridden fetch called itself for ollama.com URLs.
 *
 * These tests verify:
 * 1. The interceptor routes ollama.com URLs through the cache
 * 2. Non-ollama.com URLs pass through to the real fetch
 * 3. The interceptor does NOT recurse infinitely (tested by verifying
 *    behavior with a controlled mock, not actual network calls)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the function that produces the interceptor.
// We test the interceptor's behavior, not the ci-server.ts CLI wrapper.
import { createFetchInterceptor } from '../../testing/ci-interceptor';

describe('createFetchInterceptor', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('intercepts ollama.com URLs through the cache', async () => {
    const mockHtml = '<html><body>mock ollama page</body></html>';

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(mockHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    createFetchInterceptor('ua', 'accept', 'accept-language');

    const res = await globalThis.fetch('https://ollama.com/search?q=qwen');
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html');
    expect(text).toBe(mockHtml);

    // Second call should be cached — no additional network call.
    const res2 = await globalThis.fetch('https://ollama.com/search?q=qwen');
    const text2 = await res2.text();
    expect(text2).toBe(mockHtml);
    expect(mockFetch).toHaveBeenCalledTimes(1); // cached
  });

  it('passes non-ollama.com URLs through to original fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('external', { status: 200 }),
    );

    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    createFetchInterceptor('ua', 'accept', 'accept-language');

    await globalThis.fetch('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    await globalThis.fetch('https://example.com/other');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT recurse infinitely — interceptor uses captured original fetch', async () => {
    // Track how many times the interceptor invokes the underlying fetch.
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      callCount++;
      return new Response('<html>ok</html>', { status: 200 });
    });

    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    createFetchInterceptor('ua', 'accept', 'accept-language');

    // Trigger the interceptor 10 times. If there were infinite recursion,
    // this would overflow the stack and never return (or throw RangeError).
    for (let i = 0; i < 10; i++) {
      await globalThis.fetch(`https://ollama.com/search?q=test${i}`);
    }

    // Each ollama.com URL should result in exactly one underlying fetch
    // (different URLs, no caching overlap).
    expect(callCount).toBe(10);
  });
});
