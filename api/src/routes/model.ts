import type { Context } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { scrapeModelPage } from '../model/scraper';
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

export const modelHandler = async (c: Context<{ Bindings: Bindings }>) => {
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

    console.error(JSON.stringify({
      level: 'error',
      alert: 'critical',
      title: 'Model Tag Lookup Failed',
      timestamp: new Date().toISOString(),
      request: `GET /model?name=${name}`,
      scrapeUrl,
      error: errStr,
    }));

    return c.json({
      error: {
        code: isParseError ? ErrorCodes.SCRAPE_PARSE_ERROR : ErrorCodes.SCRAPE_UPSTREAM_ERROR,
        message: isParseError ? 'Failed to parse Ollama model tags' : 'Ollama model service returned an error',
        detail: errStr,
      },
    }, 502);
  }
};
