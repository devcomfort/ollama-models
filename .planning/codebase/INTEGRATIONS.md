# External Integrations

> Last updated: 2026-06-27

## Upstream Data Source

### Ollama.com (Web Scraping)

The core purpose of this project: scrape `ollama.com` HTML pages to extract model search results and tag/weight listings as structured JSON.

| Aspect | Detail |
|--------|--------|
| Base URL | `https://ollama.com` (configurable via `OLLAMA_BASE` env var) |
| Endpoints scraped | `/search?q=…&page=…` — model search results |
| | `/library/<model>/tags` — model weight tags |
| Method | HTTP GET with custom headers (`User-Agent`, `Accept`, `Accept-Language`) |
| Parsing | `node-html-parser` with CSS selectors (`a.group.w-full` for search, `a[href^="/"][href*=":"]` for tags) |
| Resilience | `fetchWithRetry` (2 retries, 1s delay on network errors); health check detects selector breakage as `structure_change` |
| Caching | Cloudflare Cache API — search results cached 60s, model tags cached 300s |
| Auto-heal | When selectors break, a GitHub Actions pipeline uses OpenCode AI to inspect the live HTML and propose selector patches via PR |

## Cloudflare Platform

### Cloudflare Workers — API

| Feature | Usage |
|---------|-------|
| Worker: `ollama-models-api` | Production API serving `/search`, `/model`, `/health` |
| Worker: `ollama-models-api-staging` | Staging environment for pre-production verification |
| Cache API | `caches.default` for HTTP response caching |
| Tail Workers | API streams execution events to the alerts worker via `[[tail_consumers]]` binding |
| Environment variables | `OLLAMA_BASE`, `OLLAMA_USER_AGENT`, `OLLAMA_ACCEPT`, `OLLAMA_ACCEPT_LANGUAGE` |
| Secrets | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (CI/CD deploy only) |

### Cloudflare Workers — Alerts Tail Worker

| Feature | Usage |
|---------|-------|
| Worker: `ollama-models-alerts` | Receives tail events from API worker |
| Cloudflare Email Service | Sends error alert emails via `env.EMAIL.send()` (`[[send_email]]` binding in `workers/alerts/wrangler.toml`) |
| Email domain | `alerts@ollama.devcomfort.me` (requires DKIM/SPF DNS records) |
| Secret | `ALERT_EMAIL_TO` — recipient email address |
| Trigger | Only fires on non-`ok` worker outcomes |

### Cloudflare Pages — Documentation

| Feature | Usage |
|---------|-------|
| Project: `ollama-models` | Hosts the Astro/Starlight documentation site |
| URL | `https://ollama.devcomfort.me` |
| Deploy | `wrangler pages deploy docs/ --project-name ollama-models` from CI |

## GitHub Platform

### GitHub Actions — CI/CD

All workflows run on `ubuntu-latest` with Node 22 and Python 3.12.

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to main | API type-check + tests → TS client tests → Python client tests |
| `e2e.yml` | push/PR to main (docs/e2e paths) | Playwright E2E browser tests against live demo page |
| `deploy.yml` | push to main (path-filtered) | Staging deploy → verify → production deploy → E2E → npm publish → docs deploy |
| `publish-npm.yml` | `ts-v*` tag push | Publish TS client to npm |
| `publish-pypi.yml` | `py-v*` tag push | Build → TestPyPI → PyPI (OIDC Trusted Publisher) |
| `health-monitor.yml` | cron every 5 min | Probe `/health`; triggers auto-heal on 3 consecutive `structure_change` failures |
| `auto-heal.yml` | `workflow_dispatch` from health-monitor | Uses OpenCode AI to patch CSS selectors and open PR |

### GitHub Secrets

| Secret | Used By |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | deploy.yml — authenticates `wrangler deploy` for Workers + Pages |
| `CLOUDFLARE_ACCOUNT_ID` | deploy.yml — targets the correct Cloudflare account |
| `NPM_TOKEN` | deploy.yml, publish-npm.yml — authenticates `pnpm publish` to npm registry |
| `GITHUB_TOKEN` | health-monitor.yml, auto-heal.yml — `gh` CLI for PR/issue triage (listing open PRs, creating issues) |
| `OPENCODE_API_KEY` | auto-heal.yml — authenticates the OpenCode AI GitHub Action |

### GitHub Environments

| Environment | Usage |
|-------------|-------|
| `staging` | Staging deploy gate in deploy.yml |
| `production` | Production deploy gate in deploy.yml |
| `testpypi` | TestPyPI publish gate (OIDC Trusted Publisher, `id-token: write`) |
| `pypi` | PyPI publish gate (OIDC Trusted Publisher, `id-token: write`) |

### GitHub CLI (`gh`) Usage

The health-monitor and auto-heal workflows use the `gh` CLI extensively:

- **Duplicate prevention**: `gh pr list --label auto-heal --state open` checks for existing open auto-heal PRs before triggering
- **Escalation guard**: `gh issue list --label needs-human --state open` checks for unresolved human-needed issues
- **Attempt counting**: `gh pr list --label auto-heal --search "created:>=…"` counts recent non-merged PRs to limit retry attempts to 3 per 24h window
- **Issue creation**: `gh issue create` with `auto-heal,needs-human` labels when attempts exhausted
- **Workflow dispatch**: `gh workflow run "Auto-Heal Scrapers"` triggers the auto-heal pipeline from health-monitor

### Auto-Heal Pipeline (OpenCode AI Integration)

| Aspect | Detail |
|--------|--------|
| Service | `anomalyco/opencode/github@latest` GitHub Action |
| Model | `opencode-go/deepseek-v4-pro` |
| Auth | `OPENCODE_API_KEY` secret |
| Purpose | When ollama.com HTML structure changes break scrapers, OpenCode inspects the live site and patches CSS selectors |
| Files modified | `api/src/search/scraper.ts` (search card selectors), `api/src/model/scraper.ts` (tag card selectors) |
| Output | Opens a PR labeled `auto-heal` + `attempt-N` for human review |
| Safeguards | Never auto-merges; max 3 attempts per 24h; escalates to `needs-human` issue on exhaustion; duplicate PR prevention via `gh pr list` check |
| Concurrency | `group: auto-heal` with `cancel-in-progress: false` — queues rather than cancels overlapping runs |

## Package Registries

### npm

| Aspect | Detail |
|--------|--------|
| Package | `ollama-models` (v0.3.0) |
| Auth | `NPM_TOKEN` secret via `NODE_AUTH_TOKEN` env var |
| Trigger | `ts-v*` git tag push or post-E2E in deploy pipeline |
| Smoke test | `scripts/smoke-ts-client.sh` verifies built artifact before publish |

### PyPI

| Aspect | Detail |
|--------|--------|
| Package | `ollama-models` (v0.2.0) |
| Auth | OIDC Trusted Publisher (no API token; `id-token: write` permission) |
| Action | `pypa/gh-action-pypi-publish@release/v1` |
| Flow | Build → upload artifact → TestPyPI → PyPI (two-stage publish) |
| Trigger | `py-v*` git tag push |

## API Endpoints Exposed

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/search?q=…&page=…` | GET | Search Ollama models by keyword; returns paginated model pages |
| `/model?name=…` | GET | Get all available tags (weights) for a named model |
| `/health` | GET | Live health check probing both scrapers; returns structured failure classification |
| `/openapi.json` | GET | Auto-generated OpenAPI 3.0 specification (produced by `@hono/zod-openapi`) |

## Outbound HTTP Calls

| Destination | From | Purpose |
|-------------|------|---------|
| `https://ollama.com/search` | API Worker (search scraper) | Fetch search result HTML for parsing |
| `https://ollama.com/library/*/tags` | API Worker (model scraper) | Fetch model tag HTML for parsing |
| `https://ollama.com/search`, `…/library/qwen3/tags` | API Worker (health check) | Live scraper probes with stable inputs |
| Cloudflare Email Service | Alerts Tail Worker | Error notification emails on worker failures |

## Monitoring & Observability

| Mechanism | Detail |
|-----------|--------|
| `/health` endpoint | Probes both scrapers with stable inputs (`qwen` keyword, `library/qwen3` model); classifies failures as `structure_change`, `upstream_down`, or `network_error` |
| Tail Workers | Real-time execution event streaming from API to alerts worker via `[[tail_consumers]]` |
| Health Monitor (cron) | GitHub Actions runs every 5 minutes, probes `/health` with 3 attempts (5s apart), triggers auto-heal on consecutive `structure_change` |
| Auto-heal escalation | After 3 failed attempts in 24h (counted via non-merged PRs), opens a `needs-human` GitHub issue |
| Error alerting | Email alerts via Cloudflare Email Service on non-ok worker outcomes (recipient from `ALERT_EMAIL_TO` secret) |
