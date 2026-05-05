# ollama-models

<p align="center">
  <a href="https://ollama-models.pages.dev"><img src="https://img.shields.io/badge/docs-ollama--models.pages.dev-2EB67D" alt="Docs"></a>
  <a href="https://www.npmjs.com/package/@devcomfort/ollama-models"><img src="https://img.shields.io/npm/v/@devcomfort/ollama-models?color=cb3837&label=npm" alt="npm"></a>
  <a href="https://pypi.org/project/ollama-models/"><img src="https://img.shields.io/pypi/v/ollama-models?color=3775A9&label=pypi" alt="PyPI"></a>
  <a href="https://pypi.org/project/ollama-models/"><img src="https://img.shields.io/pypi/pyversions/ollama-models" alt="Python versions"></a>
  <br>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/ci.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/deploy.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/health-monitor.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/health-monitor.yml/badge.svg" alt="Health"></a>
  <a href="https://redocly.github.io/redoc/?url=https%3A%2F%2Follama-models-api.devcomfort.workers.dev%2Fopenapi.json"><img src="https://img.shields.io/badge/OpenAPI-3.0-85EA2D?logo=openapiinitiative" alt="OpenAPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-BSD--3--Clause-blue" alt="License"></a>
</p>

Search and list [Ollama](https://ollama.com) model weights programmatically. Ollama does not provide a public registry API — this project scrapes SSR HTML and exposes the data as structured JSON through a Cloudflare Workers API.

| Service | URL |
|---------|-----|
| 📖 Documentation | [ollama-models.pages.dev](https://ollama-models.pages.dev) |
| 🔌 API | [ollama-models-api.devcomfort.workers.dev](https://ollama-models-api.devcomfort.workers.dev) |

---

## Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  TypeScript  │────▶│  Cloudflare      │────▶│  ollama.com     │
│  / Python    │     │  Workers API     │     │  (SSR HTML)    │
│  Client      │◀────│  (Hono, cached)  │◀────│                 │
└──────────────┘     └─────────────────┘     └─────────────────┘
                     ┌─────────────────┐
                     │  Cloudflare      │
                     │  Pages (docs)    │
                     │  Astro Starlight │
                     └─────────────────┘
```

```
┌─────────────────────────────────────────────────┐
│  GitHub Actions                                  │
│                                                  │
│  main push → CI (test) → Deploy                  │
│                ├─ API (wrangler)                  │
│                ├─ Docs (pages)                    │
│                └─ Clients (npm)                   │
│  cron */5  → Health Monitor → /health probe ×3  │
│                │ structure_change?               │
│                ▼ YES                             │
│           Auto-Heal → OpenCode AI → fix PR       │
│                                                  │
│  py-v* tag → Publish to PyPI (OIDC)              │
│  ts-v* tag → Publish to npm (NPM_TOKEN)          │
└─────────────────────────────────────────────────┘
```

---

## Packages

| Package | Install | Version |
|---|---|---|
| **TypeScript/JS** | `npm install @devcomfort/ollama-models` | [![npm](https://img.shields.io/npm/v/@devcomfort/ollama-models)](https://www.npmjs.com/package/@devcomfort/ollama-models) |
| **Python** | `pip install ollama-models` | [![PyPI](https://img.shields.io/pypi/v/ollama-models)](https://pypi.org/project/ollama-models/) |

---

## Quick Start

### TypeScript

```typescript
import { OllamaModelsClient } from '@devcomfort/ollama-models';

const client = new OllamaModelsClient();

// Search models
const result = await client.search('qwen3');
result.pages.forEach(p => console.log(p.http_url));

// List all tags for a model
const model = await client.getModel('qwen3');
console.log(model.default_tag); // "qwen3:latest"
```

### Python

```python
from ollama_models import OllamaModelsClient

client = OllamaModelsClient()

# Search models
result = client.search("qwen3", page=1)
for page in result.pages:
    print(page.http_url)

# List all tags for a model
model = client.get_model("qwen3")
print(model.default_tag)  # "qwen3:latest"

# Async
import asyncio

async def main():
    result = await client.search_async("qwen3")
    model = await client.get_model_async("qwen3")

asyncio.run(main())
```

### REST API

**Base URL:** `https://ollama-models-api.devcomfort.workers.dev`

| Endpoint | Parameters | Description |
|---|---|---|
| `GET /search` | `q` (string), `page` (number, default 1) | Search models |
| `GET /model` | `name` (string) | List all tags for a model |
| `GET /health` | — | Scraper health status |

```bash
# Search for "qwen"
curl "https://ollama-models-api.devcomfort.workers.dev/search?q=qwen"

# Get all tags for qwen3
curl "https://ollama-models-api.devcomfort.workers.dev/model?name=qwen3"
```

[![OpenAPI](https://img.shields.io/badge/OpenAPI-Interactive-85EA2D?logo=openapiinitiative)](https://redocly.github.io/redoc/?url=https%3A%2F%2Follama-models-api.devcomfort.workers.dev%2Fopenapi.json)

---

## Auto-Heal Pipeline

When ollama.com changes its HTML structure, scrapers break. The auto-heal pipeline detects this automatically and opens a fix PR — no human intervention needed except the final merge.

```
Cron */5 min → /health probe ×3 → structure_change?
                                        │ YES
                                        ▼
                                   Triage Gate
                                   (dedup, attempt count)
                                        │
                                        ▼
                                   OpenCode AI
                                   (visits ollama.com,
                                    fixes selectors,
                                    runs tests)
                                        │
                                        ▼
                                   Fix PR (auto-heal label)
                                        │
                                   Human reviews & merges
```

- **attempts 1–3**: OpenCode creates a fix PR with `auto-heal` and `attempt-N` labels
- **attempt ≥4**: Pipeline stops auto-healing and creates a `needs-human` issue
- **race protection**: Both health-monitor and auto-heal check for existing open PRs/issues before acting
- **Slack notifications**: All pipeline events (failures, escalations, PR creation) are reported to the configured Slack channel

Read more in the [Auto-Heal documentation](https://ollama-models.pages.dev/en/auto-heal/).

---

## Development

### Requirements

- [Node.js](https://nodejs.org) v22+
- [pnpm](https://pnpm.io) v10+
- [rye](https://rye.astral.sh) (Python package manager)

### Setup

```bash
pnpm install        # Node.js dependencies
pnpm py:sync        # Python dependencies
```

### Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start API local dev server |
| `pnpm docs:dev` | Start docs site locally |
| `pnpm test` | Run all tests (TypeScript + Python) |
| `pnpm test:api` | API unit tests only |
| `pnpm build` | Build TypeScript client |
| `pnpm build:docs` | Build documentation site |
| `pnpm type-check` | Type-check all TypeScript |

### Project Structure

```
api/                  Cloudflare Workers API (Hono + Zod OpenAPI)
  src/routes/         HTTP route definitions (search, model, health)
  src/search/         Search scraper + handler
  src/model/          Model scraper
  src/health/         Health check logic
  src/alerts/channels/ Alert adapters (Slack, Discord, Email)
  src/lib/            Shared utilities (cache, fetchWithRetry)
packages/
  ts-client/          TypeScript client (@devcomfort/ollama-models)
  py-client/          Python client (ollama-models)
docs/                 Documentation site (Astro Starlight)
scripts/              CI/CD scripts (notify.sh, smoke-ts-client.sh, e2e.sh)
```

---

## Types

```typescript
interface ModelPage {
  http_url: string;
  model_id: string;
}

interface SearchResult {
  pages: ModelPage[];
  page_range: number | { from: number; to: number };
  keyword: string;
}

interface ModelTags {
  page_url: string;
  id: string;           // e.g. "library/qwen3"
  tags: string[];       // e.g. ["qwen3:latest", "qwen3:4b"]
  default_tag: string | null;
}
```

---

## License

[BSD-3-Clause](LICENSE)
