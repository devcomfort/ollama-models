# ollama-models (Python)

[Ollama](https://ollama.com) 레지스트리에서 모델을 검색하고 나열하는 Python 클라이언트.

English | **한국어**

## 설치

```bash
pip install ollama-models
```

## 사용법

```python
from ollama_models import OllamaModelsClient

# 기본 URL 불필요 — 공식 호스팅 인스턴스 사용
client = OllamaModelsClient()

# 자체 호스팅 API를 사용하는 경우에만 base_url 전달
# client = OllamaModelsClient("https://your-own-instance.workers.dev")

# 모델 검색
result = client.search("qwen3", page=1)
for page in result.pages:
    print(page.http_url)

# 모델의 모든 태그 조회
model = client.get_model("qwen3")
print(model.default_tag)          # qwen3:latest
for t in model.tags:
    print(t)                      # qwen3:latest, qwen3:4b, ...

# 비동기 사용
import asyncio

async def main():
    result = await client.search_async("qwen3")
    model  = await client.get_model_async("qwen3")

asyncio.run(main())
```
