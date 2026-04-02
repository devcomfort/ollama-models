# @devcomfort/ollama-models

TypeScript/JavaScript client for searching and listing models from the [Ollama](https://ollama.com) registry.

## Installation

```bash
npm install @devcomfort/ollama-models
# or
pnpm add @devcomfort/ollama-models
```

## Usage

```typescript
import { OllamaModelsClient } from '@devcomfort/ollama-models';

// No base URL needed — defaults to the official hosted instance
const client = new OllamaModelsClient();

// Pass a base URL only if you self-host the API
// const client = new OllamaModelsClient('https://your-own-instance.workers.dev');

// Search models
const result = await client.search('qwen3', 1);
result.pages.forEach(p => console.log(p.http_url));

// Get all tags for a model
const model = await client.getModel('qwen3');
console.log(model.default_model_id); // qwen3:latest
model.model_list.forEach(w => console.log(w.id));
```

## API

### `new OllamaModelsClient(baseUrl?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `baseUrl` | `string` | `https://ollama-models-api.devcomfort.workers.dev` | Base URL of the ollama-models Workers API |

### `client.search(keyword?, page?): Promise<SearchResult>`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `keyword` | `string` | `""` | Search term |
| `page` | `number` | `1` | Page number (1-based) |

### `client.getModel(name): Promise<ModelList>`

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Model identifier (`qwen3`, `library/qwen3`, `User/model`, or full URL) |

## Types

```typescript
interface SearchResult {
  pages: ModelPage[];
  page_id: number;
  keyword: string;
}

interface ModelList {
  model_list: ModelWeight[];
  default_model_id: string;
}

interface ModelPage {
  http_url: string;
}

interface ModelWeight {
  http_url: string;
  id: string; // e.g. "qwen3:4b"
}
```
