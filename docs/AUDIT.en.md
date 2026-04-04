# Monitoring, Alerting & Schema Validation

## Overview
This document explains how the API detects scraper failures and ensures schema consistency across the project. By reading this, you will understand how to configure alerts and maintain schema synchronization during development.

---

## Monitoring & Alerting

The API detects scraper failures—caused by changes to Ollama's HTML structure—and notifies you via a webhook before users notice.

### Prerequisites
- A Slack-compatible webhook URL.
- `wrangler` CLI installed and configured.

### Scheduled health checks
`api/wrangler.toml` registers a Cloudflare Cron Trigger that fires hourly:

```toml
[triggers]
crons = ["0 * * * *"]
```

The `scheduled` handler in `api/src/index.ts` calls `runHealthCheck()`, which probes both scrapers:

- **Search**: Calls `scrapeSearchPage(1, "qwen")` and verifies results.
- **Model**: Calls `scrapeModelPage({ model_id: "library/qwen3", … })` and verifies tags.

If a probe fails, `buildHealthAlertMessage()` formats a Slack mrkdwn payload, and `sendAlert()` dispatches it to the configured `ALERT_WEBHOOK_URL`.

### Per-request alerts
The API triggers alerts immediately when a live user request to `GET /search` or `GET /model` fails. This ensures that broken CSS selectors are reported within seconds, rather than waiting for the next hourly cron run.

### Troubleshooting
If an alert triggers:
1. **Verify the Ollama page**: Check the URL provided in the alert.
2. **Inspect the scraper**: Review the source code in `api/src/search/scraper.ts` or `api/src/model/scraper.ts`.
3. **Check logs**: Use the Cloudflare dashboard to view worker logs.
4. **Update selectors**: If the HTML structure changed, update the CSS selectors in the scraper.

### Relevant source locations

| Concern | File | Description |
|---|---|---|
| Cron trigger config | `api/wrangler.toml` | Defines the hourly cron schedule. |
| Scheduled handler | `api/src/index.ts` | Entry point for Cloudflare Workers cron triggers. |
| Health check logic | `api/src/index.ts` | `runHealthCheck()` probes scrapers and aggregates results. |
| Alert message builder | `api/src/index.ts` | `buildHealthAlertMessage()` formats the Slack mrkdwn string. |
| Alert dispatcher | `api/src/index.ts` | `sendAlert()` performs the POST request to the webhook. |
| Per-request alert | `api/src/index.ts` | `catch` blocks in route handlers trigger alerts on failure. |

---

## Schema Validation Pipeline

A single [OpenAPI 3.0 spec](../api/openapi.json) serves as the ground truth for the API, TypeScript client, and Python client. The CI pipeline enforces schema consistency.

### How the spec is generated
`api/src/schemas.ts` defines request and response shapes as **Zod schemas**. API routes in `api/src/index.ts` use `createRoute()` from `@hono/zod-openapi` to link these schemas to endpoints. The build script regenerates the spec from these definitions:

```bash
pnpm --filter ollama-models-api gen-openapi
```

### CI enforcement
The CI pipeline in `.github/workflows/ci.yml` regenerates `api/openapi.json` and compares it against the committed version. If they differ, the build fails, preventing the merge of unsynced schema changes.

### Troubleshooting
If the CI build fails due to a stale spec:
1. Run `pnpm --filter ollama-models-api gen-openapi` locally.
2. Commit the updated `api/openapi.json` file.
3. Push the changes to the repository.

### Relevant source locations

| Concern | File |
|---|---|
| Zod schema definitions | `api/src/schemas.ts` |
| OpenAPI route registration | `api/src/index.ts` |
| Spec generator script | `api/scripts/gen-openapi.ts` |
| Committed OpenAPI spec | `api/openapi.json` |
| CI pipeline | `.github/workflows/ci.yml` |
| TS client integration tests | `packages/ts-client/src/__tests__/integration.test.ts` |
| Python integration tests | `packages/py-client/tests/test_integration.py` |
| Mock Node.js server | `api/scripts/serve-for-ci.ts` |
