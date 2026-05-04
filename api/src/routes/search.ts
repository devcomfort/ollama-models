import { createRoute } from '@hono/zod-openapi';
import { scrapeSearchPage } from '../search/scraper';
import { createAlertService } from '../alerts/service';
import {
  SearchQuerySchema,
  SearchResultSchema,
  ErrorResponseSchema,
  ErrorCodes,
} from '../schemas';
import { ParseError } from '../errors';
import type { SearchResult } from '../search/types';
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
export const searchHandler = async (c: any) => {
  const { q, page: pageStr } = c.req.valid('query');
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const keyword = q ?? '';

  try {
    const pages = await scrapeSearchPage(page, keyword, c.env);
    const result: SearchResult = { pages, page_range: page, keyword };
    return c.json(result);
  } catch (err) {
    const errStr = String(err);
    const isParseError = err instanceof ParseError;
    const scrapeUrl = `${c.env.OLLAMA_BASE}/search?q=${encodeURIComponent(keyword)}&p=${page}`;

    const alertService = createAlertService(c.env);
    await alertService.send('critical', 'Model List Search Failed', [
      `*Time:* ${new Date().toISOString()}`,
      ``,
      `A user request to list/search Ollama models failed. The scraper could not parse the Ollama search results page.`,
      ``,
      `*Request:* \`GET /search?page=${page}&q=${keyword}\``,
      `*Scraped URL:* <${scrapeUrl}|${scrapeUrl}>`,
      ``,
      `*Error:*`,
      `\`${errStr}\``,
      ``,
      `─────────────────────────────`,
      `📍 *Where to check:*`,
      `• *Ollama search page* (open and verify it loads): <${scrapeUrl}|${scrapeUrl}>`,
      `• *Scraper code*: \`api/src/search/scraper.ts\` → \`scrapeSearchPage()\` — check CSS selectors`,
      `• *Cloudflare logs*: <https://dash.cloudflare.com/|Cloudflare dashboard> → Workers & Pages → \`ollama-models-api\` → Logs`,
    ].join('\n'));

    return c.json({
      error: {
        code: isParseError ? ErrorCodes.SCRAPE_PARSE_ERROR : ErrorCodes.SCRAPE_UPSTREAM_ERROR,
        message: isParseError ? 'Failed to parse Ollama search results' : 'Ollama search service returned an error',
        detail: errStr,
      },
    }, 502);
  }
};
