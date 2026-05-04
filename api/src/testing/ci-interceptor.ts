/**
 * Creates a fetch interceptor for CI — ollama.com URLs are cached in memory
 * so tests are deterministic and fast after the first request.
 *
 * Must be called BEFORE the interceptor is needed. The captured `originalFetch`
 * is read at call time, then the interceptor uses it internally — preventing
 * the infinite recursion bug where the overridden `fetch` calls itself.
 */
export function createFetchInterceptor(
  userAgent: string,
  accept: string,
  acceptLanguage: string,
): { clearCache: () => void } {
  const originalFetch = globalThis.fetch;
  const cache = new Map<string, string>();

  async function fetchCached(url: string): Promise<string> {
    if (cache.has(url)) return cache.get(url)!;

    const res = await originalFetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: accept,
        'Accept-Language': acceptLanguage,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch fixture: HTTP ${res.status} ${url}`);
    }

    const text = await res.text();
    cache.set(url, text);
    return text;
  }

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input.toString();

    if (url.includes('ollama.com')) {
      const html = await fetchCached(url);
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return originalFetch(input, init);
  };

  return {
    clearCache: () => cache.clear(),
  };
}
