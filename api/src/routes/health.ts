import type { Context } from 'hono';
import { createRoute } from '@hono/zod-openapi';
import { runHealthCheck } from '../health';
import { HealthStatusSchema } from '../schemas';
import type { Bindings } from '../types';

// === OpenAPI route definition ===

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  description: 'Runs live probes against both scrapers and returns their status.',
  tags: ['Health'],
  responses: {
    200: {
      description: 'All probes passed',
      content: { 'application/json': { schema: HealthStatusSchema } },
    },
    503: {
      description: 'One or more probes failed',
      content: { 'application/json': { schema: HealthStatusSchema } },
    },
  },
});

// === Handler ===

export const healthHandler = async (c: Context<{ Bindings: Bindings }>) => {
  const status = await runHealthCheck(c.env);
  return c.json(status, status.ok ? 200 : 503);
};
