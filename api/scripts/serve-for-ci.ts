/**
 * Minimal mock API server for Python integration tests.
 *
 * Starts the Hono app on port 8787 (or the PORT env-var) using
 * `@hono/node-server`. Scraper modules are replaced with stubs that return
 * deterministic, schema-valid fixtures so tests never hit ollama.com.
 *
 * Usage (started by pytest fixture via subprocess):
 *   tsx api/scripts/serve-for-ci.ts
 *
 * The process writes "READY" to stdout after the server is listening so the
 * pytest fixture knows when to proceed.
 */

// Stub the Cloudflare Workers Cache API so Node.js does not throw.
Object.defineProperty(globalThis, 'caches', {
  value: {
    default: {
      match: async () => undefined,
      put: async () => undefined,
    },
  },
  writable: true,
});

import { serve } from '@hono/node-server';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import {
  SearchQuerySchema,
  SearchResultSchema,
  ModelQuerySchema,
  ModelTagsSchema,
  HealthStatusSchema,
  ErrorResponseSchema,
} from '../src/schemas.ts';
import { OLLAMA_BASE } from '../src/constants.ts';

// === Mock fixtures ===

const MOCK_SEARCH_PAGES = [
  { http_url: `${OLLAMA_BASE}/library/qwen3`, model_id: 'library/qwen3' },
  { http_url: `${OLLAMA_BASE}/library/mistral`, model_id: 'library/mistral' },
];

const MOCK_MODEL_TAGS = {
  page_url: `${OLLAMA_BASE}/library/qwen3`,
  id: 'library/qwen3',
  tags: ['qwen3:latest', 'qwen3:4b', 'qwen3:8b'],
  default_tag: 'qwen3:latest',
};

// === Routes (same Zod schemas as production) ===

const searchRoute = createRoute({
  method: 'get',
  path: '/search',
  request: { query: SearchQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: SearchResultSchema } }, description: 'ok' },
    500: { content: { 'application/json': { schema: ErrorResponseSchema } }, description: 'err' },
  },
});

const modelRoute = createRoute({
  method: 'get',
  path: '/model',
  request: { query: ModelQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: ModelTagsSchema } }, description: 'ok' },
    400: { content: { 'application/json': { schema: ErrorResponseSchema } }, description: 'bad' },
    500: { content: { 'application/json': { schema: ErrorResponseSchema } }, description: 'err' },
  },
});

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: { content: { 'application/json': { schema: HealthStatusSchema } }, description: 'ok' },
    503: { content: { 'application/json': { schema: HealthStatusSchema } }, description: 'fail' },
  },
});

// === App ===

const app = new OpenAPIHono();
app.use('*', cors());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.openapi(searchRoute, ((c: any) => {
  const keyword = c.req.valid('query').q ?? '';
  return c.json({ pages: MOCK_SEARCH_PAGES, page_range: 1, keyword });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.openapi(modelRoute, ((c: any) => {
  const { name } = c.req.valid('query');
  if (!name?.trim()) {
    return c.json({ error: '`name` query parameter is required' }, 400);
  }
  return c.json(MOCK_MODEL_TAGS);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.openapi(healthRoute, ((c: any) => {
  return c.json({
    ok: true,
    timestamp: new Date().toISOString(),
    checks: {
      search: { ok: true, count: MOCK_SEARCH_PAGES.length },
      model: { ok: true, count: MOCK_MODEL_TAGS.tags.length },
    },
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any);

// === Start ===

const PORT = Number(process.env['PORT'] ?? 8787);
serve({ fetch: app.fetch, port: PORT }, () => {
  // Write READY so the pytest fixture knows the port is open.
  process.stdout.write('READY\n');
});
