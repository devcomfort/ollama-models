# ollama-models

<p align="center">
  <strong>Search and list Ollama model weights programmatically</strong>
</p>

<p align="center">
  <a href="https://ollama.devcomfort.me"><img src="https://img.shields.io/badge/docs-ollama.devcomfort.me-2EB67D?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Docs"></a>
  <a href="https://ollama.devcomfort.me/try/"><img src="https://img.shields.io/badge/try_it_now-58a6ff?style=for-the-badge&logo=rocket&logoColor=white" alt="Try Now"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ollama-models"><img src="https://img.shields.io/npm/v/ollama-models?color=cb3837&label=npm" alt="npm"></a>
  <a href="https://pypi.org/project/ollama-models/"><img src="https://img.shields.io/pypi/v/ollama-models?color=3775A9&label=pypi" alt="PyPI"></a>
  <a href="https://pypi.org/project/ollama-models/"><img src="https://img.shields.io/pypi/pyversions/ollama-models" alt="Python"></a>
  <br>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/ci.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/deploy.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/health-monitor.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/health-monitor.yml/badge.svg" alt="Health"></a>
  <a href="https://ollama.devcomfort.me/api/openapi.json"><img src="https://img.shields.io/badge/OpenAPI-3.0-85EA2D?logo=openapiinitiative" alt="OpenAPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-BSD--3--Clause-blue" alt="License"></a>
  <br>
  <img src="https://img.shields.io/badge/coverage_API-98%25-brightgreen" alt="API Coverage">
  <img src="https://img.shields.io/badge/coverage_TS-92%25-brightgreen" alt="TS Client Coverage">
  <img src="https://img.shields.io/badge/coverage_Python-99%25-brightgreen" alt="Python Coverage">
</p>

---

**English** | [한국어](README.ko.md)

[Ollama](https://ollama.com) does not provide a public registry API. This project scrapes SSR HTML from `ollama.com` and exposes the data as structured JSON through a Cloudflare Workers API — with client SDKs for TypeScript and Python.

| | |
|---|---|
| 📖 **Documentation** | [ollama.devcomfort.me](https://ollama.devcomfort.me) |
| 🔌 **API** | [ollama.devcomfort.me/api](https://ollama.devcomfort.me/api) |
| 🧪 **Try Now** | [ollama.devcomfort.me/try](https://ollama.devcomfort.me/try/) |
| 📋 **OpenAPI** | [Interactive Docs](https://ollama.devcomfort.me/api/openapi.json) |

---

## Quick Start

### TypeScript / JavaScript

```bash
npm install ollama-models
```

```typescript
import { OllamaModelsClient } from 'ollama-models';

const client = new OllamaModelsClient();

// Search models
const result = await client.search('qwen3');
result.pages.forEach(p => console.log(p.model_id));

// Get all tags (weights) for a model
const model = await client.getModel('library/qwen3');
console.log(model.tags); // ["qwen3:latest", "qwen3:4b", ...]
```

### Python

```bash
pip install ollama-models
```

```python
from ollama_models import OllamaModelsClient

client = OllamaModelsClient()

# Search models
result = client.search("qwen3", page=1)
for page in result.pages:
    print(page.model_id)

# Get all tags for a model
model = client.get_model("library/qwen3")
print(model.tags)  # ["qwen3:latest", "qwen3:4b", ...]

# Async support
import asyncio
async def main():
    result = await client.search_async("qwen3")
    model = await client.get_model_async("library/qwen3")
asyncio.run(main())
```

### REST API

```bash
# Search models
curl "https://ollama.devcomfort.me/api/search?q=qwen3"

# Get all tags for a model
curl "https://ollama.devcomfort.me/api/model?name=library/qwen3"

# Health check
curl "https://ollama.devcomfort.me/api/health"
```

| Endpoint | Parameters | Description |
|----------|-----------|-------------|
| `GET /search` | `q` (string), `page` (number, default 1) | Search models |
| `GET /model` | `name` (string) | List all tags for a model |
| `GET /health` | — | Scraper health status |

---

## Features

- **Multi-language SDKs** — TypeScript and Python clients with sync + async support
- **Response caching** — 60s for search, 300s for model tags (Cloudflare Cache API)
- **Auto-heal pipeline** — Detects ollama.com HTML changes and opens fix PRs via AI
- **Staging-first deploy** — Every change is verified on staging before production
- **Email alerts** — Runtime errors sent via Cloudflare Email Service (Tail Worker)
- **Interactive demo** — [Try Now](https://ollama.devcomfort.me/try/) page with live API calls
- **OpenAPI spec** — Auto-generated, available at `/api/openapi.json`
- **Bilingual docs** — English + Korean documentation

---

## Architecture

```
ollama.devcomfort.me
├── /              → Docs (Cloudflare Pages, Astro Starlight)
├── /try/          → Interactive demo
├── /api/search    → API (Cloudflare Workers, Hono)
├── /api/model     │
├── /api/health    │
└── /api/openapi.json

GitHub Actions (staging → production pipeline)
├── CI: test (TypeScript + Python)
├── Deploy: staging → verify → production
├── Health Monitor: /health probe every 5 min
└── Auto-Heal: AI-powered selector fix PRs
```

---

## Auto-Heal

When ollama.com changes its HTML structure, the health monitor detects it and the auto-heal pipeline creates a fix PR — no human intervention except the final merge.

| Attempt | Action |
|---------|--------|
| 1–3 | OpenCode creates fix PR (`auto-heal` label) |
| ≥4 | Stops auto-healing, creates `needs-human` issue |

Read more → [Auto-Heal Documentation](https://ollama.devcomfort.me/en/auto-heal/)

---

## Development

### Requirements

- [Node.js](https://nodejs.org) v22+
- [pnpm](https://pnpm.io) v10+
- [uv](https://docs.astral.sh/uv/) (Python)

### Setup

```bash
pnpm install        # Node.js dependencies
pnpm py:sync        # Python dependencies
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start API dev server |
| `pnpm test` | Run all tests |
| `pnpm test:api` | API tests only |
| `pnpm build` | Build all packages |
| `pnpm type-check` | Type-check TypeScript |
| `nx graph` | Visualize project dependency graph |

### Project Structure

```
api/                  Cloudflare Workers API (Hono + Zod OpenAPI)
  src/routes/         HTTP route definitions
  src/search/         Search scraper + handler
  src/model/          Model scraper
  src/health/         Health check logic
  src/lib/            Cache, fetchWithRetry utilities
packages/
  ts-client/          TypeScript client (ollama-models)
  py-client/          Python client (ollama-models)
workers/
  alerts/             Tail Worker: runtime error → email alerts
docs/                 Documentation site (Astro Starlight)
  src/pages/try/      Interactive API demo
scripts/              CI/CD scripts
```

---

## License

[BSD-3-Clause](LICENSE)
