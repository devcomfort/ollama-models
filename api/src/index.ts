import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Handler } from 'hono';
import { scrapeSearchPage } from './search/scraper';
import { scrapeModelPage } from './model/scraper';
import { OLLAMA_BASE } from './constants';
import type { SearchResult, ModelPage } from './search/types';
import type { ModelTags } from './model/types';

type Bindings = {
  /** Webhook URL to POST alert notifications to when a scheduled health check fails. */
  ALERT_WEBHOOK_URL?: string;
};

/**
 * Sends an alert to the webhook when `ALERT_WEBHOOK_URL` is configured.
 * Send failures are silently ignored — alert failures must not interfere with
 * the original error handling path.
 *
 * @param webhookUrl - URL to POST to.
 * @param message - The `text` field of the webhook payload.
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

// ---------------------------------------------------------------------------
// Health check helpers
// ---------------------------------------------------------------------------

/** Well-known probe target with a reliably large number of tags. */
const PROBE_MODEL: ModelPage = {
  http_url: `${OLLAMA_BASE}/library/qwen3`,
  model_id: 'library/qwen3',
};
const PROBE_KEYWORD = 'qwen';

/** Result of a single scraper probe run during a health check. */
interface CheckResult {
  /** `true` when the probe returned at least one result without throwing. */
  ok: boolean;
  /** Number of results returned by the probe when the check passed. */
  count?: number;
  /** Stringified error message when the check failed. */
  error?: string;
}

/** Response shape of the `GET /health` endpoint. */
interface HealthStatus {
  /** `true` only when every individual check passed. */
  ok: boolean;
  /** ISO 8601 timestamp of when the health check was run. */
  timestamp: string;
  /** Per-scraper probe results. */
  checks: {
    search: CheckResult;
    model: CheckResult;
  };
}

/**
 * Runs live probes against both scrapers with stable inputs and returns a
 * structured result.
 *
 * Neither probe throws — errors are captured in the returned
 * `CheckResult.error` field so the `/health` handler can always respond.
 *
 * @returns A {@link HealthStatus} whose `ok` is `true` only when both the
 *   search and model scrapers succeed.
 */
async function runHealthCheck(): Promise<HealthStatus> {
  const timestamp = new Date().toISOString();
  let search: CheckResult = { ok: false };
  let model: CheckResult = { ok: false };

  try {
    const pages = await scrapeSearchPage(1, PROBE_KEYWORD);
    search = { ok: pages.length > 0, count: pages.length };
  } catch (err) {
    search = { ok: false, error: String(err) };
  }

  try {
    const { tags } = await scrapeModelPage(PROBE_MODEL);
    model = { ok: tags.length > 0, count: tags.length };
  } catch (err) {
    model = { ok: false, error: String(err) };
  }

  return { ok: search.ok && model.ok, timestamp, checks: { search, model } };
}

/**
 * Builds a structured Slack mrkdwn alert message for a failed health check.
 * Includes probe details, error messages, passing checks, and actionable links.
 */
function buildHealthAlertMessage(status: HealthStatus): string {
  const entries = Object.entries(status.checks) as [string, CheckResult][];

  const lines: string[] = [
    `🚨 *[ollama-models] Health Check Failed*`,
    `*Time:* ${status.timestamp}`,
    ``,
  ];

  for (const [name, result] of entries) {
    const label = name === 'search' ? 'Model list search' : 'Model tag lookup';
    if (result.ok) {
      if (name === 'search') {
        lines.push(`✅ *${label}* — searched for \`"${PROBE_KEYWORD}"\`, ${result.count} model(s) found`);
      } else {
        lines.push(`✅ *${label}* — fetched tags for \`${PROBE_MODEL.model_id}\`, ${result.count} tag(s) found`);
      }
    } else {
      if (name === 'search') {
        const url = `${OLLAMA_BASE}/search?q=${encodeURIComponent(PROBE_KEYWORD)}`;
        lines.push(`❌ *${label}* — searched for \`"${PROBE_KEYWORD}"\` on page 1`);
        lines.push(`  Probe URL: <${url}|${url}>`);
      } else {
        const url = `${PROBE_MODEL.http_url}/tags`;
        lines.push(`❌ *${label}* — fetched tags for \`${PROBE_MODEL.model_id}\``);
        lines.push(`  Probe URL: <${url}|${url}>`);
      }
      lines.push(`  Error: \`${result.error ?? 'returned 0 results'}\``);
    }
  }

  lines.push(``);
  lines.push(`─────────────────────────────`);
  lines.push(`📍 *Where to check:*`);
  lines.push(``);
  lines.push(`_Search (model list)_`);
  lines.push(`• Ollama search page: <${OLLAMA_BASE}/search?q=${encodeURIComponent(PROBE_KEYWORD)}|${OLLAMA_BASE}/search?q=${PROBE_KEYWORD}>`);
  lines.push(`• Scraper code: \`api/src/search/scraper.ts\` → \`scrapeSearchPage()\``);
  lines.push(``);
  lines.push(`_Model (tag lookup)_`);
  lines.push(`• Ollama model tags page: <${PROBE_MODEL.http_url}/tags|${PROBE_MODEL.http_url}/tags>`);
  lines.push(`• Scraper code: \`api/src/model/scraper.ts\` → \`scrapeModelPage()\``);
  lines.push(``);
  lines.push(`_General_`);
  lines.push(`• Health check logic: \`api/src/index.ts\` → \`runHealthCheck()\``);
  lines.push(`• Cloudflare logs: <https://dash.cloudflare.com/|Cloudflare dashboard> → Workers & Pages → \`ollama-models-api\` → Logs`);

  return lines.join('\n');
}

const app = new Hono<{ Bindings: Bindings }>();

// Allow cross-origin requests so browser-based clients can call the API
app.use('*', cors());

// ---------------------------------------------------------------------------
// Cache router
// Wraps route handlers with a Cloudflare Cache API lookup/store.
// Returns the cached Response on a hit; on a miss runs the handler, caches
// the result for `ttl` seconds, and returns the fresh response.
// ---------------------------------------------------------------------------

/**
 * Wraps a Hono route handler with a Cloudflare Cache API lookup/store.
 *
 * Returns the cached {@link Response} immediately on a cache hit. On a miss,
 * executes the handler, stores the JSON response at the request URL for the
 * given TTL, and returns the fresh response.
 *
 * `/health` is intentionally excluded from caching because it must always
 * reflect live scraper state.
 *
 * @param ttl - Cache lifetime in seconds.
 * @param handler - The original Hono route handler to wrap.
 */
function withCache(
  ttl: number,
  handler: Handler<{ Bindings: Bindings }>,
): Handler<{ Bindings: Bindings }> {
  return async (c) => {
    const cache = caches.default;
    const cacheKey = new Request(c.req.url);

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const res = await handler(c, () => Promise.resolve());
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

/** 1-minute TTL so new models surface in search results quickly. */
const SEARCH_TTL = 60;
/** 5-minute TTL so tag changes are visible within 5 minutes. */
const MODEL_TTL = 300;

/**
 * `GET /search?q={keyword}&page={n}`
 *
 * Returns a {@link SearchResult} containing all model pages found on the
 * requested Ollama search page. `page` defaults to `1`; invalid values are
 * clamped to `1`. `q` defaults to an empty string (all models).
 *
 * Responds with `500` when the scraper throws (e.g. Ollama down, HTML
 * structure changed).
 */
app.get('/search', withCache(SEARCH_TTL, async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const keyword = c.req.query('q') ?? '';

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

/**
 * `GET /model?name={model-name}`
 *
 * Returns a {@link ModelTags} containing the model URL, model ID, full tag
 * list, and `default_tag` (`null` when no `latest` tag exists).
 *
 * Accepted `name` formats:
 * - `library/qwen3` — explicit library path for official models
 * - `RogerBen/qwen3.5-35b-opus-distill` — community model
 * - `https://ollama.com/library/qwen3` — full URL
 *
 * Responds with `400` when `name` is missing or blank, `500` on scraper
 * error.
 */
app.get('/model', withCache(MODEL_TTL, async (c) => {
  const name = c.req.query('name') ?? '';
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

/**
 * `GET /health`
 *
 * Probes both scrapers with stable inputs and returns a {@link HealthStatus}
 * object. Responds with `200` when all checks pass, `503` when any fail.
 * Never throws — all probe errors are captured in the response body.
 */
app.get('/health', async (c) => {
  const status = await runHealthCheck();
  return c.json(status, status.ok ? 200 : 503);
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
   * On failure, POSTs a JSON alert to the `ALERT_WEBHOOK_URL` secret if set.
   * The payload uses a Slack-compatible `text` field and works out of the box
   * with Slack, Discord (Slack-compatible), and most generic webhook services.
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
