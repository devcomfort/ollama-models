import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { searchRoute, searchHandler } from './routes/search';
import { modelRoute, modelHandler } from './routes/model';
import { healthRoute, healthHandler } from './routes/health';
import { openapiConfig } from './routes/openapi';
import { withCache, SEARCH_TTL, MODEL_TTL } from './lib/cache';
import { ErrorCodes } from './schemas';
import type { Bindings } from './types';

const app = new OpenAPIHono<{ Bindings: Bindings }>({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultHook: (result, c: any) => {
    if (!result.success) {
      return c.json({
        error: {
          code: ErrorCodes.INVALID_PARAMETER,
          message: result.error.message,
        },
      }, 400);
    }
  },
});

app.use('*', cors());

app.openapi(searchRoute, withCache(SEARCH_TTL, searchHandler));
app.openapi(modelRoute, withCache(MODEL_TTL, modelHandler));
app.openapi(healthRoute, healthHandler);

app.doc('/openapi.json', openapiConfig);

export { app };
export default { fetch: app.fetch };
