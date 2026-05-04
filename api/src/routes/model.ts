import { createRoute } from '@hono/zod-openapi';
import { scrapeModelPage } from '../model/scraper';
import { createAlertService } from '../alerts/service';
import {
  ModelQuerySchema,
  ModelTagsSchema,
  ErrorResponseSchema,
  ErrorCodes,
} from '../schemas';
import { ParseError } from '../errors';
import type { ModelPage } from '../search/types';
import type { ModelTags } from '../model/types';
import type { Bindings } from '../types';

// === OpenAPI route definition ===

export const modelRoute = createRoute({
  method: 'get',
  path: '/model',
  summary: 'Get model tags',
  description: 'Returns all available tags for a specific Ollama model.',
  tags: ['Model'],
  request: { query: ModelQuerySchema },
  responses: {
    200: {
      description: 'Model tags',
      content: { 'application/json': { schema: ModelTagsSchema } },
    },
    400: {
      description: 'Missing or invalid `name` parameter',
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
export const modelHandler = async (c: any) => {
  const { name } = c.req.valid('query');
  if (!name.trim()) {
    return c.json({
      error: {
        code: ErrorCodes.INVALID_PARAMETER,
        message: '`name` query parameter is required',
      },
    }, 400);
  }

  const path = name
    .replace(/^(?:https?:\/\/ollama\.com)?\/+/, '')
    .replace(/\/tags\/?$/, '');

  if (!path.includes('/')) {
    return c.json(
      {
        error: {
          code: ErrorCodes.INVALID_PARAMETER,
          message: `Invalid name "${name}": pass "library/${path}" for official models or "username/${path}" for community models.`,
        },
      },
      400,
    );
  }

  try {
    const modelPage: ModelPage = {
      http_url: `${c.env.OLLAMA_BASE}/${path}`,
      model_id: path,
    };

    const result: ModelTags = await scrapeModelPage(modelPage, c.env);
    return c.json(result);
  } catch (err) {
    const errStr = String(err);
    const isParseError = err instanceof ParseError;
    const scrapeUrl = `${c.env.OLLAMA_BASE}/${path}/tags`;

    const alertService = createAlertService(c.env);
    await alertService.send('critical', 'Model Tag Lookup Failed', [
      `*Time:* ${new Date().toISOString()}`,
      ``,
      `A user request to fetch tags for a specific model failed. The scraper could not parse the Ollama model tags page.`,
      ``,
      `*Request:* \`GET /model?name=${name}\``,
      `*Scraped URL:* <${scrapeUrl}|${scrapeUrl}>`,
      ``,
      `*Error:*`,
      `\`${errStr}\``,
      ``,
      `─────────────────────────────`,
      `📍 *Where to check:*`,
      `• *Ollama model tags page* (open and verify it loads): <${scrapeUrl}|${scrapeUrl}>`,
      `• *Scraper code*: \`api/src/model/scraper.ts\` → \`scrapeModelPage()\` — check CSS selectors`,
      `• *Cloudflare logs*: <https://dash.cloudflare.com/|Cloudflare dashboard> → Workers & Pages → \`ollama-models-api\` → Logs`,
    ].join('\n'));

    return c.json({
      error: {
        code: isParseError ? ErrorCodes.SCRAPE_PARSE_ERROR : ErrorCodes.SCRAPE_UPSTREAM_ERROR,
        message: isParseError ? 'Failed to parse Ollama model tags' : 'Ollama model service returned an error',
        detail: errStr,
      },
    }, 502);
  }
};
