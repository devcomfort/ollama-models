import { createRoute } from '@hono/zod-openapi';
import { search } from '../search/handler';
import {
  SearchQuerySchema,
  SearchResultSchema,
  ErrorResponseSchema,
  ErrorCodes,
} from '../schemas';
import { ParseError } from '../errors';
import type { PageRange } from '../search/types';
import type { Bindings } from '../types';

// === OpenAPI route definition ===

export const searchRoute = createRoute({
  method: 'get',
  path: '/search',
  summary: 'Search Ollama models',
  description: 'Returns a paginated list of model pages matching the given keyword.',
  tags: ['Search'],
  request: { query: SearchQuerySchema },
  responses: {
    200: {
      description: 'Matching model pages',
      content: { 'application/json': { schema: SearchResultSchema } },
    },
    400: {
      description: 'Invalid query parameters',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    502: {
      description: 'Scraper error (upstream failure or parse error)',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

// === Handler ===

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const searchHandler = async (c: { req: { valid: (t: string) => unknown }; env: Bindings; json: (body: unknown, status?: number) => Response }) => {
  const { q, page: pageStr } = c.req.valid('query') as { q?: string; page?: string };
  const keyword = q ?? '';

  // Parse page: "1" → number, "1-3" → { from, to }
  let range: PageRange = 1;
  if (pageStr) {
    const parts = pageStr.split('-');
    if (parts.length === 2) {
      const from = Math.max(1, parseInt(parts[0], 10) || 1);
      const to = Math.max(from, parseInt(parts[1], 10) || from);
      range = { from, to };
    } else {
      range = Math.max(1, parseInt(pageStr, 10) || 1);
    }
  }

  try {
    const result = await search(keyword, range, 0, c.env);
    return c.json(result);
  } catch (err) {
    const errStr = String(err);
    const isParseError = err instanceof ParseError;
    const scrapeUrl = `${c.env.OLLAMA_BASE}/search?q=${encodeURIComponent(keyword)}&p=${pageStr ?? '1'}`;

    console.error(JSON.stringify({
      level: 'error',
      alert: 'critical',
      title: 'Model List Search Failed',
      timestamp: new Date().toISOString(),
      request: `GET /search?page=${pageStr ?? '1'}&q=${keyword}`,
      scrapeUrl,
      error: errStr,
    }));

    return c.json({
      error: {
        code: isParseError ? ErrorCodes.SCRAPE_PARSE_ERROR : ErrorCodes.SCRAPE_UPSTREAM_ERROR,
        message: isParseError ? 'Failed to parse Ollama search results' : 'Ollama search service returned an error',
        detail: errStr,
      },
    }, 502);
  }
};
