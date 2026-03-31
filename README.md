# ollama-models

API and client libraries for searching models and listing all available tags (weights) from the [Ollama](https://ollama.com) registry.

Ollama does not provide a public API for registry search. This project scrapes SSR HTML to return search results and model tags as structured JSON.

> **Note:** This project was written with **Claude Sonnet 4.6** via [GitHub Copilot](https://github.com/features/copilot).

---

## Structure

```
api/                      # Cloudflare Workers REST API (deployed)
packages/
  ts-client/              # @ollama-models/client — TypeScript/JS client
  py-client/              # ollama-models — Python client
```

---

## REST API

**Base URL:** `https://ollama-models-api.devcomfort.workers.dev`

### `GET /search`

Returns a list of model page URLs from the Ollama search page.

**Query parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | `""` | Search term (e.g. `qwen3`, `mistral`) |
| `page` | number | `1` | Page number |

**Example response**

```json
{
  "pages": [
    { "http_url": "https://ollama.com/library/qwen3" },
    { "http_url": "https://ollama.com/library/qwen3-coder" }
  ],
  "page_id": 1,
  "keyword": "qwen3"
}
```

---

### `GET /model`

Returns all available tags (weights) for a model.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Model identifier — accepts `qwen3`, `library/qwen3`, `RogerBen/model`, or a full URL |

**Example response**

```json
{
  "model_list": [
    { "http_url": "https://ollama.com/library/qwen3", "id": "qwen3:latest" },
    { "http_url": "https://ollama.com/library/qwen3", "id": "qwen3:4b" },
    { "http_url": "https://ollama.com/library/qwen3", "id": "qwen3:8b" }
  ],
  "default_model_id": "qwen3:latest"
}
```

---

## TypeScript Client

### Installation

```bash
npm install @ollama-models/client
# or
pnpm add @ollama-models/client
```

### Usage

```typescript
import { OllamaModelsClient } from '@ollama-models/client';

// No base URL needed — defaults to the official hosted instance
const client = new OllamaModelsClient();

// Pass a base URL only if you self-host the API
// const client = new OllamaModelsClient('https://your-own-instance.workers.dev');

// Search for models
const result = await client.search('qwen3', 1);
result.pages.forEach(p => console.log(p.http_url));

// Get all tags for a model
const model = await client.getModel('qwen3');
console.log(model.default_model_id); // qwen3:latest
model.model_list.forEach(w => console.log(w.id));
```

---

## Python Client

### Installation

```bash
pip install ollama-models
```

### Usage

```python
from ollama_models import OllamaModelsClient

# No base URL needed — defaults to the official hosted instance
client = OllamaModelsClient()

# Pass a base URL only if you self-host the API
# client = OllamaModelsClient("https://your-own-instance.workers.dev")

# Search for models (sync)
result = client.search("qwen3", page=1)
for page in result.pages:
    print(page.http_url)

# Get all tags for a model (sync)
model = client.get_model("qwen3")
print(model.default_model_id)  # qwen3:latest
for w in model.model_list:
    print(w.id)  # qwen3:latest, qwen3:4b, ...

# Async usage
import asyncio

async def main():
    result = await client.search_async("qwen3")
    model  = await client.get_model_async("qwen3")

asyncio.run(main())
```

---

## Development

### Requirements

- [Node.js](https://nodejs.org) v18+
- [pnpm](https://pnpm.io) v8+
- [rye](https://rye.astral.sh) (Python package manager)

### Setup

```bash
# Install Node.js dependencies
pnpm install

# Install Python dependencies
pnpm py:sync
```

### Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the Workers API local dev server |
| `pnpm deploy` | Deploy the Workers API to Cloudflare |
| `pnpm build` | Build the TypeScript client |
| `pnpm type-check` | Type-check all TypeScript |
| `pnpm py:build` | Build the Python package (wheel + sdist) |
| `pnpm ts:publish` | Publish to npm |
| `pnpm py:publish` | Publish to PyPI |

### Deploying to Cloudflare Workers

Set `account_id` in `api/wrangler.toml`, then:

```bash
pnpm deploy
```

---

## Type Definitions

```typescript
interface ModelPage {
  http_url: string; // model page URL
}

interface SearchResult {
  pages: ModelPage[];
  page_id: number;  // page number
  keyword: string;  // search term
}

interface ModelWeight {
  http_url: string; // model page URL
  id: string;       // download ID (e.g. qwen3:4b)
}

interface ModelList {
  model_list: ModelWeight[];
  default_model_id: string; // default model ID
}
```

---

## License

MIT
