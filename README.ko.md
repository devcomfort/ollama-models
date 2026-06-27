# ollama-models

<p align="center">
  <a href="https://ollama.devcomfort.me"><img src="https://img.shields.io/badge/docs-ollama.devcomfort.me-2EB67D" alt="Docs"></a>
  <a href="https://www.npmjs.com/package/@devcomfort/ollama-models"><img src="https://img.shields.io/npm/v/@devcomfort/ollama-models?color=cb3837&label=npm" alt="npm"></a>
  <a href="https://pypi.org/project/ollama-models/"><img src="https://img.shields.io/pypi/v/ollama-models?color=3775A9&label=pypi" alt="PyPI"></a>
  <a href="https://pypi.org/project/ollama-models/"><img src="https://img.shields.io/pypi/pyversions/ollama-models" alt="Python versions"></a>
  <br>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/ci.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/deploy.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/deploy.yml/badge.svg" alt="Deploy"></a>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/health-monitor.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/health-monitor.yml/badge.svg" alt="Health"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-BSD--3--Clause-blue" alt="License"></a>
</p>

[English](README.md) | **한국어**

[Ollama](https://ollama.com) 모델 가중치를 프로그래밍하게 검색하고 나열합니다. Ollama는 공개 레지스트리 API를 제공하지 않으며, 이 프로젝트는 SSR HTML을 스크래핑하여 Cloudflare Workers API를 통해 구조화된 JSON으로 제공합니다.

| 서비스 | URL |
|---------|-----|
| 📖 문서 | [ollama.devcomfort.me](https://ollama.devcomfort.me) |
| 🔌 API | [ollama.devcomfort.me/api](https://ollama.devcomfort.me/api) |
| 🧪 체험하기 | [ollama.devcomfort.me/try](https://ollama.devcomfort.me/try/) |

---

## 아키텍처

```
┌──────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  TypeScript  │────▶│  Cloudflare      │────▶│  ollama.com     │
│  / Python    │     │  Workers API     │     │  (SSR HTML)    │
│  클라이언트   │◀────│  (Hono, 캐시)    │◀────│                 │
└──────────────┘     └─────────────────┘     └─────────────────┘
                     ┌─────────────────┐
                     │  Cloudflare      │
                     │  Pages (문서)     │
                     │  Astro Starlight │
                     └─────────────────┘
```

---

## 패키지

| 패키지 | 설치 | 버전 |
|---|---|---|
| **TypeScript/JS** | `npm install @devcomfort/ollama-models` | [![npm](https://img.shields.io/npm/v/@devcomfort/ollama-models)](https://www.npmjs.com/package/@devcomfort/ollama-models) |
| **Python** | `pip install ollama-models` | [![PyPI](https://img.shields.io/pypi/v/ollama-models)](https://pypi.org/project/ollama-models/) |

---

## 빠른 시작

### TypeScript

```typescript
import { OllamaModelsClient } from '@devcomfort/ollama-models';

const client = new OllamaModelsClient();

// 모델 검색
const result = await client.search('qwen3');
result.pages.forEach(p => console.log(p.http_url));

// 모델의 모든 태그 조회
const model = await client.getModel('qwen3');
console.log(model.default_tag); // "qwen3:latest"
```

### Python

```python
from ollama_models import OllamaModelsClient

client = OllamaModelsClient()

# 모델 검색
result = client.search("qwen3", page=1)
for page in result.pages:
    print(page.http_url)

# 모델의 모든 태그 조회
model = client.get_model("qwen3")
print(model.default_tag)  # "qwen3:latest"

# 비동기
import asyncio

async def main():
    result = await client.search_async("qwen3")
    model = await client.get_model_async("qwen3")

asyncio.run(main())
```

### REST API

**Base URL:** `https://ollama.devcomfort.me/api`

| 엔드포인트 | 파라미터 | 설명 |
|---|---|---|
| `GET /search` | `q` (문자열), `page` (숫자, 기본 1) | 모델 검색 |
| `GET /model` | `name` (문자열) | 모델의 모든 태그 조회 |
| `GET /health` | — | 스크래퍼 상태 확인 |

```bash
# "qwen" 검색
curl "https://ollama.devcomfort.me/api/search?q=qwen"

# qwen3의 모든 태그 조회
curl "https://ollama.devcomfort.me/api/model?name=qwen3"
```

---

## Auto-Heal 파이프라인

ollama.com이 HTML 구조를 변경하면 스크래퍼가 실패합니다. Auto-heal 파이프라인은 이를 자동으로 감지하고 수정 PR을 생성합니다 — 최종 머지를 제외하면 사람의 개입이 필요 없습니다.

- **시도 1~3회**: OpenCode가 `auto-heal` 및 `attempt-N` 라벨로 수정 PR 생성
- **시도 ≥4회**: 파이프라인이 자동 치유를 중단하고 `needs-human` 이슈 생성
- **경쟁 방지**: health-monitor와 auto-heal 모두 기존 열린 PR/이슈를 확인 후 동작
- **이메일 알림**: 런타임 에러는 Cloudflare Email Service를 통해 설정된 주소로 전송

자세한 내용은 [Auto-Heal 문서](https://ollama.devcomfort.me/ko/auto-heal/)를 참조하세요.

---

## 개발

### 요구사항

- [Node.js](https://nodejs.org) v22+
- [pnpm](https://pnpm.io) v10+
- [rye](https://rye.astral.sh) (Python 패키지 관리자)

### 설정

```bash
pnpm install        # Node.js 의존성 설치
pnpm py:sync        # Python 의존성 설치
```

### 명령어

| 명령어 | 설명 |
|---|---|
| `pnpm dev` | API 로컬 개발 서버 시작 |
| `pnpm docs:dev` | 문서 사이트 로컬 실행 |
| `pnpm test` | 전체 테스트 실행 (TypeScript + Python) |
| `pnpm test:api` | API 단위 테스트만 |
| `pnpm build` | TypeScript 클라이언트 빌드 |
| `pnpm build:docs` | 문서 사이트 빌드 |
| `pnpm type-check` | 전체 TypeScript 타입 체크 |

### 프로젝트 구조

```
api/                  Cloudflare Workers API (Hono + Zod OpenAPI)
  src/routes/         HTTP 라우트 정의 (search, model, health)
  src/search/         검색 스크래퍼 + 핸들러
  src/model/          모델 스크래퍼
  src/health/         헬스 체크 로직
  src/lib/            공유 유틸리티 (cache, fetchWithRetry)
packages/
  ts-client/          TypeScript 클라이언트 (@devcomfort/ollama-models)
  py-client/          Python 클라이언트 (ollama-models)
workers/
  alerts/             Tail Worker: 실시간 에러 → 이메일 알림
docs/                 문서 사이트 (Astro Starlight)
scripts/              CI/CD 스크립트 (smoke-ts-client.sh, e2e.sh)
```

---

## 타입

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
  id: string;           // 예: "library/qwen3"
  tags: string[];       // 예: ["qwen3:latest", "qwen3:4b"]
  default_tag: string | null;
}
```

---

## 라이선스

[BSD-3-Clause](LICENSE)
