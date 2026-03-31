# ollama-models (Python)

Python client for searching and listing models from the [Ollama](https://ollama.com) registry.

## Installation

```bash
pip install ollama-models
```

## Usage

```python
from ollama_models import OllamaModelsClient

# No base URL needed — defaults to the official hosted instance
client = OllamaModelsClient()

# Pass a base URL only if you self-host the API
# client = OllamaModelsClient("https://your-own-instance.workers.dev")

# Search models
result = client.search("qwen3", page=1)
for page in result.pages:
    print(page.http_url)

# Get all tags for a model
model = client.get_model("qwen3")
print(model.default_model_id)   # qwen3:latest
for w in model.model_list:
    print(w.id)                 # qwen3:latest, qwen3:4b, ...

# Async usage
import asyncio

async def main():
    result = await client.search_async("qwen3")
    model  = await client.get_model_async("qwen3")

asyncio.run(main())
```
