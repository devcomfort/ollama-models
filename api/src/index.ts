import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { scrapeSearchPage } from './search/scraper';
import { scrapeModelPage } from './model/scraper';
import { OLLAMA_BASE } from './constants';
import {
  SearchQuerySchema,
  SearchResultSchema,
  ModelQuerySchema,
  ModelTagsSchema,
  HealthStatusSchema,
  ErrorResponseSchema,
} from './schemas';
import { runHealthCheck, buildHealthAlertMessage, PROBE_MODEL, PROBE_KEYWORD } from './health';
import type { SearchResult, ModelPage } from './search/types';
import type { ModelTags } from './model/types';
import type { HealthStatus } from './health/types';

type Bindings = {
  /**
   * Webhook URL to POST alert notifications to when a scheduled health check fails.
   *
   * 예약된 헬스 체크가 실패할 때 알림을 POST할 웹훅 URL.
   */
  ALERT_WEBHOOK_URL?: string;
};

/**
 * Sends an alert to the webhook when `ALERT_WEBHOOK_URL` is configured.
 *
 * `ALERT_WEBHOOK_URL`이 설정된 경우 웹훅으로 알림을 전송한다.
 *
 * Send failures are silently ignored — alert failures must not interfere with
 * the original error handling path.
 *
 * 전송 실패는 조용히 무시된다 — 알림 실패가 원래의 에러 처리 경로를 방해해서는 안 된다.
 *
 * @param webhookUrl - URL to POST to.
 * @param webhookUrl - POST 요청을 보낼 URL.
 * @param message - The `text` field of the webhook payload.
 * @param message - 웹훅 페이로드의 `text` 필드.
 */
async function sendAlert(webhookUrl: string, message: string): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });
  } catch {
    // silently ignore alert delivery failures
  }
}

// ─── OpenAPI route definitions ──────────────────────────────────────────────

const searchRoute = createRoute({
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
    500: {
      description: 'Scraper error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const modelRoute = createRoute({
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
    500: {
      description: 'Scraper error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const healthRoute = createRoute({
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

// ─── App ─────────────────────────────────────────────────────────────────────

const app = new OpenAPIHono<{ Bindings: Bindings }>({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultHook: (result, c: any) => {
    if (!result.success) {
      return c.json({ error: result.error.message }, 400);
    }
  },
});

// Allow cross-origin requests so browser-based clients can call the API
app.use('*', cors());

// ---------------------------------------------------------------------------
// Cache router
// Wraps route handlers with a Cloudflare Cache API lookup/store.
// Returns the cached Response on a hit; on a miss runs the handler, caches
// the result for `ttl` seconds, and returns the fresh response.
// ---------------------------------------------------------------------------

/**
 * Wraps a route handler with a Cloudflare Cache API lookup/store.
 *
 * 라우트 핸들러를 Cloudflare Cache API 조회/저장으로 래핑한다.
 *
 * Returns the cached {@link Response} immediately on a cache hit. On a miss,
 * executes the handler, stores the JSON response at the request URL for the
 * given TTL, and returns the fresh response.
 *
 * 캐시 적중 시 즉시 캐시된 {@link Response}를 반환한다. 적중하지 않으면 핸들러를
 * 실행하고, 요청 URL에 JSON 응답을 주어진 TTL 동안 저장한 뒤 새 응답을 반환한다.
 *
 * `/health` is intentionally excluded from caching because it must always
 * reflect live scraper state.
 *
 * `/health`는 항상 라이브 스크래퍼 상태를 반영해야 하므로 의도적으로 캐싱에서 제외된다.
 *
 * @param ttl - Cache lifetime in seconds.
 * @param ttl - 캐시 수명(초).
 * @param handler - The original route handler to wrap.
 * @param handler - 래핑할 원본 라우트 핸들러.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withCache(ttl: number, handler: (c: any) => Promise<Response>): any {
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

/**
 * 1-minute TTL so new models surface in search results quickly.
 *
 * 새 모델이 검색 결과에 빠르게 반영되도록 하는 1분 TTL.
 */
const SEARCH_TTL = 60;
/**
 * 5-minute TTL so tag changes are visible within 5 minutes.
 *
 * 태그 변경이 5분 이내에 반영되도록 하는 5분 TTL.
 */
const MODEL_TTL = 300;

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

app.openapi(searchRoute, withCache(SEARCH_TTL, async (c) => {
  const { q, page: pageStr } = c.req.valid('query');
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
  const keyword = q ?? '';

  try {
    const pages = await scrapeSearchPage(page, keyword);
    const result: SearchResult = { pages, page_range: page, keyword };
    return c.json(result);
  } catch (err) {
    if (c.env?.ALERT_WEBHOOK_URL) {
      const scrapeUrl = `${OLLAMA_BASE}/search?q=${encodeURIComponent(keyword)}&p=${page}`;
      await sendAlert(
        c.env.ALERT_WEBHOOK_URL,
        [
          `🚨 *[ollama-models] Model List Search Failed*`,
          `*Time:* ${new Date().toISOString()}`,
          ``,
          `A user request to list/search Ollama models failed. The scraper could not parse the Ollama search results page.`,
          ``,
          `*Request:* \`GET /search?page=${page}&q=${keyword}\``,
          `*Scraped URL:* <${scrapeUrl}|${scrapeUrl}>`,
          ``,
          `*Error:*`,
          `\`${String(err)}\``,
          ``,
          `─────────────────────────────`,
          `📍 *Where to check:*`,
          `• *Ollama search page* (open and verify it loads): <${scrapeUrl}|${scrapeUrl}>`,
          `• *Scraper code*: \`api/src/search/scraper.ts\` → \`scrapeSearchPage()\` — check CSS selectors`,
          `• *Cloudflare logs*: <https://dash.cloudflare.com/|Cloudflare dashboard> → Workers & Pages → \`ollama-models-api\` → Logs`,
        ].join('\n'),
      );
    }
    return c.json({ error: String(err) }, 500);
  }
}));

app.openapi(modelRoute, withCache(MODEL_TTL, async (c) => {
  const { name } = c.req.valid('query');
  if (!name.trim()) {
    return c.json({ error: '`name` query parameter is required' }, 400);
  }

  const path = name
    .replace(/^(?:https?:\/\/ollama\.com)?\/+/, '')
    .replace(/\/tags\/?$/, '');

  if (!path.includes('/')) {
    return c.json(
      { error: `Invalid name "${name}": pass "library/${path}" for official models or "username/${path}" for community models.` },
      400,
    );
  }

  try {
    const modelPage: ModelPage = {
      http_url: `${OLLAMA_BASE}/${path}`,
      model_id: path,
    };

    const result: ModelTags = await scrapeModelPage(modelPage);
    return c.json(result);
  } catch (err) {
    if (c.env?.ALERT_WEBHOOK_URL) {
      const scrapeUrl = `${OLLAMA_BASE}/${path}/tags`;
      await sendAlert(
        c.env.ALERT_WEBHOOK_URL,
        [
          `🚨 *[ollama-models] Model Tag Lookup Failed*`,
          `*Time:* ${new Date().toISOString()}`,
          ``,
          `A user request to fetch tags for a specific model failed. The scraper could not parse the Ollama model tags page.`,
          ``,
          `*Request:* \`GET /model?name=${name}\``,
          `*Scraped URL:* <${scrapeUrl}|${scrapeUrl}>`,
          ``,
          `*Error:*`,
          `\`${String(err)}\``,
          ``,
          `─────────────────────────────`,
          `📍 *Where to check:*`,
          `• *Ollama model tags page* (open and verify it loads): <${scrapeUrl}|${scrapeUrl}>`,
          `• *Scraper code*: \`api/src/model/scraper.ts\` → \`scrapeModelPage()\` — check CSS selectors`,
          `• *Cloudflare logs*: <https://dash.cloudflare.com/|Cloudflare dashboard> → Workers & Pages → \`ollama-models-api\` → Logs`,
        ].join('\n'),
      );
    }
    return c.json({ error: String(err) }, 500);
  }
}));

app.openapi(healthRoute, async (c) => {
  const status = await runHealthCheck();
  return c.json(status, status.ok ? 200 : 503);
});

// ─── OpenAPI spec endpoint ───────────────────────────────────────────────────

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Ollama Models API',
    version: '0.1.0',
    description: 'JSON HTTP API for searching Ollama models and listing their tags, backed by live scraping of ollama.com.',
  },
  servers: [
    { url: 'https://ollama-models-api.devcomfort.workers.dev', description: 'Production (Cloudflare Workers)' },
  ],
});

// ---------------------------------------------------------------------------
// Exports: unified fetch + scheduled handler for Cloudflare Workers
// The named export `app` is available in unit tests via app.request().
// ---------------------------------------------------------------------------

export { app };

export default {
  fetch: app.fetch,

  /**
   * Cloudflare Cron Trigger handler — runs every hour (see wrangler.toml).
   *
   * Cloudflare Cron Trigger 핸들러 — 매시간 실행됨(wrangler.toml 참조).
   *
   * On failure, POSTs a JSON alert to the `ALERT_WEBHOOK_URL` secret if set.
   * The payload uses a Slack-compatible `text` field and works out of the box
   * with Slack, Discord (Slack-compatible), and most generic webhook services.
   *
   * 실패 시 `ALERT_WEBHOOK_URL` 시크릿이 설정되어 있으면 JSON 알림을 POST한다.
   * 페이로드는 Slack 호환 `text` 필드를 사용하며, Slack, Discord(Slack 호환),
   * 대부분의 일반 웹훅 서비스에서 즉시 사용할 수 있다.
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const status = await runHealthCheck();
    if (!status.ok && env.ALERT_WEBHOOK_URL) {
      await sendAlert(env.ALERT_WEBHOOK_URL, buildHealthAlertMessage(status));
    }
  },
};
