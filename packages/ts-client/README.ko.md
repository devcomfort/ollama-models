# ollama-models

[Ollama](https://ollama.com) 레지스트리에서 모델을 검색하고 나열하는 TypeScript/JavaScript 클라이언트.

English | **한국어**

## 설치

```bash
npm install ollama-models
# 또는
pnpm add ollama-models
```

## 사용법

```typescript
import { OllamaModelsClient } from 'ollama-models';

// 기본 URL 불필요 — 공식 호스팅 인스턴스 사용
const client = new OllamaModelsClient();

// 자체 호스팅 API를 사용하는 경우에만 baseUrl 전달
// const client = new OllamaModelsClient('https://your-own-instance.workers.dev');

// 모델 검색
const result = await client.search('qwen3', 1);
result.pages.forEach(p => console.log(p.http_url));

// 모델의 모든 태그 조회
const model = await client.getModel('qwen3');
console.log(model.default_tag); // qwen3:latest
model.tags.forEach(t => console.log(t));
```

## API

### `new OllamaModelsClient(baseUrl?)`

| 파라미터 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `baseUrl` | `string` | `https://ollama.devcomfort.me/api` | ollama-models Workers API의 Base URL |

### `client.search(keyword?, page?): Promise<SearchResult>`

| 파라미터 | 타입 | 기본값 | 설명 |
|-----------|------|---------|-------------|
| `keyword` | `string` | `""` | 검색어 |
| `page` | `number` | `1` | 페이지 번호 (1부터 시작) |

### `client.getModel(name): Promise<ModelTags>`

| 파라미터 | 타입 | 설명 |
|-----------|------|-------------|
| `name` | `string` | 모델 식별자 (`qwen3`, `library/qwen3`, `User/model`, 또는 전체 URL) |

## 타입

```typescript
interface SearchResult {
  pages: ModelPage[];
  page_id: number;
  keyword: string;
}

interface ModelTags {
  page_url: string;
  id: string;           // 예: "library/qwen3"
  tags: string[];       // 예: ["qwen3:latest", "qwen3:4b"]
  default_tag: string | null;
}

interface ModelPage {
  http_url: string;
}
```
