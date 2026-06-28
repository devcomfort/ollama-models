import type { Context } from 'hono';

export function withCache<E extends Record<string, unknown>>(
  ttl: number,
  handler: (c: Context<E>) => Promise<Response>,
) {
  return async (c: Context<E>) => {
    const cache = caches.default;
    const cacheKey = new Request(c.req.url);

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

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
