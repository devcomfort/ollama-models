import type { Context } from 'hono';

export function withCache<C extends Context, R extends Response>(
  ttl: number,
  handler: (c: C) => Promise<R>,
): (c: C) => Promise<R> {
  return async (c: C): Promise<R> => {
    const cache = caches.default;
    const cacheKey = new Request(c.req.url);

    const cached = await cache.match(cacheKey);
    if (cached) {
      // Hono's typed response marker is compile-time only; Cache API preserves the runtime response.
      return cached as R;
    }

    const res = await handler(c);
    if (res.status >= 200 && res.status < 300) {
      const cached = new Response(res.clone().body, res);
      cached.headers.set('Cache-Control', `public, max-age=${ttl}`);
      await cache.put(cacheKey, cached);
    }
    return res;
  };
}

export const SEARCH_TTL = 60;
export const MODEL_TTL = 300;
