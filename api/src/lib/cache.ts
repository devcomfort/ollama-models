// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withCache(ttl: number, handler: (c: any) => Promise<Response>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (c: any) => {
    const cache = caches.default;
    const cacheKey = new Request(c.req.url);

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const res = await handler(c);
    const body = await res.text();
    const fresh = new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    await cache.put(cacheKey, fresh.clone());
    return fresh;
  };
}

export const SEARCH_TTL = 60;
export const MODEL_TTL = 300;
