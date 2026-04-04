# INTEGRATIONS.md — External Services and APIs

## External HTTP Dependencies

### ollama.com (Primary Dependency)

| Aspect | Detail |
|---|---|
| Base URL | `https://ollama.com` (`OLLAMA_BASE` constant in `api/src/constants.ts`) |
| Usage | HTML scraping — not an official API |
| Search page | `GET https://ollama.com/search?q={keyword}&page={n}` |
| Model tags page | `GET https://ollama.com/{profile}/{name}/tags` |
| Coupling | **High** — CSS selectors are hardcoded; any HTML structure change breaks the scrapers |

CSS selectors currently in use:
- Search results: `a.group.w-full` — identifies model card links
- Model tags: `a[class*="flex flex-col"]` — identifies tag card links

### Scraper Headers

All requests send custom headers defined in `api/src/constants.ts`:
```
User-Agent: ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)
Accept: text/html,application/xhtml+xml
Accept-Language: en-US,en;q=0.9
```

## Cloudflare Platform

| Feature | How Used |
|---|---|
| Workers runtime | Primary execution environment for `api/` |
| Cache API (`caches.default`) | Request-level HTTP response caching; search TTL 60s, model TTL 300s |
| Cron Triggers | Hourly health check (`0 * * * *`) via `wrangler.toml` |
| Workers Secrets | `ALERT_WEBHOOK_URL` — optional; set via `wrangler secret put` |
| Workers Logs | Accessible via Cloudflare dashboard |

## Alert Webhook (Optional)

- **Trigger**: Cron health check failure OR user-facing scraper error
- **Endpoint**: Any URL set in the `ALERT_WEBHOOK_URL` environment secret
- **Payload format**: `{ "text": "..." }` — compatible with Slack Incoming Webhooks and Discord Slack-compatible webhooks
- **Alert conditions**:
  - `GET /search` scraper throws (user request failure)
  - `GET /model` scraper throws (user request failure)  
  - Hourly cron health check fails

## Published Package Registries

| Registry | Package | Publish Command |
|---|---|---|
| NPM | `@devcomfort/ollama-models` | `pnpm ts:publish` → `pnpm publish --access public` |
| PyPI | `ollama-models` | `pnpm py:publish` → `twine upload dist/*` |

## Client → API

The TS and Python clients both target the same Workers API:

- **Default endpoint**: `https://ollama-models-api.devcomfort.workers.dev`
- Both clients accept a custom `base_url` / `baseUrl` constructor argument for self-hosting
- No auth required — public API

## No Database / Auth Provider

This project has no database, no authentication, and no session management. All data is fetched live from `ollama.com` on every request (subject to Cloudflare Cache API caching).
