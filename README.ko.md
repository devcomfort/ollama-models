# ollama-models

<p align="center">
  <strong>Ollama 모델 가중치를 프로그래밍하게 검색하고 나열합니다</strong>
</p>

<p align="center">
  <a href="https://ollama.devcomfort.me/ko/"><img src="https://img.shields.io/badge/docs-ollama.devcomfort.me-2EB67D?style=for-the-badge&logo=cloudflare&logoColor=white" alt="문서"></a>
  <a href="https://ollama.devcomfort.me/try/"><img src="https://img.shields.io/badge/체험하기-58a6ff?style=for-the-badge&logo=rocket&logoColor=white" alt="체험하기"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/ollama-models"><img src="https://img.shields.io/npm/v/ollama-models?color=cb3837&label=npm" alt="npm"></a>
  <a href="https://pypi.org/project/ollama-models/"><img src="https://img.shields.io/pypi/v/ollama-models?color=3775A9&label=pypi" alt="PyPI"></a>
  <a href="https://pypi.org/project/ollama-models/"><img src="https://img.shields.io/pypi/pyversions/ollama-models" alt="Python"></a>
  <br>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/ci.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/deploy.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/deploy.yml/badge.svg" alt="배포"></a>
  <a href="https://github.com/devcomfort/ollama-models/actions/workflows/health-monitor.yml"><img src="https://github.com/devcomfort/ollama-models/actions/workflows/health-monitor.yml/badge.svg" alt="헬스"></a>
  <a href="https://ollama.devcomfort.me/api/openapi.json"><img src="https://img.shields.io/badge/OpenAPI-3.0-85EA2D?logo=openapiinitiative" alt="OpenAPI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-BSD--3--Clause-blue" alt="라이선스"></a>
</p>

---

[English](README.md) | **한국어**

[Ollama](https://ollama.com)는 공개 레지스트리 API를 제공하지 않습니다. 이 프로젝트는 `ollama.com`의 SSR HTML을 스크래핑하여 Cloudflare Workers API를 통해 구조화된 JSON으로 제공합니다 — TypeScript와 Python 클라이언트 SDK 포함.

| | |
|---|---|
| 📖 **문서** | [ollama.devcomfort.me](https://ollama.devcomfort.me/ko/) |
| 🔌 **API** | [ollama.devcomfort.me/api](https://ollama.devcomfort.me/api) |
| 🧪 **체험하기** | [ollama.devcomfort.me/try](https://ollama.devcomfort.me/try/) |
| 📋 **OpenAPI** | [인터랙티브 문서](https://ollama.devcomfort.me/api/openapi.json) |

---

## 빠른 시작

### TypeScript / JavaScript

```bash
npm install ollama-models
```

```typescript
import { OllamaModelsClient } from 'ollama-models';

const client = new OllamaModelsClient();

// 모델 검색
const result = await client.search('qwen3');
result.pages.forEach(p => console.log(p.model_id));

// 모델의 모든 태그(가중치) 조회
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

# 모델 검색
result = client.search("qwen3", page=1)
for page in result.pages:
    print(page.model_id)

# 모델의 모든 태그 조회
model = client.get_model("library/qwen3")
print(model.tags)  # ["qwen3:latest", "qwen3:4b", ...]

# 비동기 지원
import asyncio
async def main():
    result = await client.search_async("qwen3")
    model = await client.get_model_async("library/qwen3")
asyncio.run(main())
```

### REST API

```bash
# 모델 검색
curl "https://ollama.devcomfort.me/api/search?q=qwen3"

# 모델의 모든 태그 조회
curl "https://ollama.devcomfort.me/api/model?name=library/qwen3"

# 헬스 체크
curl "https://ollama.devcomfort.me/api/health"
```

| 엔드포인트 | 파라미터 | 설명 |
|-----------|---------|------|
| `GET /search` | `q` (문자열), `page` (숫자, 기본 1) | 모델 검색 |
| `GET /model` | `name` (문자열) | 모델의 모든 태그 조회 |
| `GET /health` | — | 스크래퍼 상태 확인 |

---

## 기능

- **다중 언어 SDK** — TypeScript와 Python 클라이언트 (동기 + 비동기 지원)
- **응답 캐싱** — 검색 60초, 모델 태그 300초 (Cloudflare Cache API)
- **Auto-Heal 파이프라인** — ollama.com HTML 변경 감지 시 AI가 수정 PR 자동 생성
- **Staging-first 배포** — 모든 변경사항이 스테이징 검증 후 프로덕션에 배포
- **이메일 알림** — 런타임 에러를 Cloudflare Email Service로 전송 (Tail Worker)
- **인터랙티브 데모** — [체험하기](https://ollama.devcomfort.me/try/) 페이지에서 라이브 API 호출
- **OpenAPI 스키마** — 자동 생성, `/api/openapi.json`에서 확인 가능
- **이중 언어 문서** — 영어 + 한국어 문서 완전 지원

---

## 아키텍처

```
ollama.devcomfort.me
├── /              → 문서 (Cloudflare Pages, Astro Starlight)
├── /try/          → 인터랙티브 데모
├── /api/search    → API (Cloudflare Workers, Hono)
├── /api/model     │
├── /api/health    │
└── /api/openapi.json

GitHub Actions (staging → production 파이프라인)
├── CI: 테스트 (TypeScript + Python)
├── 배포: staging → 검증 → production
├── 헬스 모니터: 5분마다 /health 프로브
└── Auto-Heal: AI 기반 셀렉터 수정 PR
```

---

## Auto-Heal

ollama.com이 HTML 구조를 변경하면 헬스 모니터가 감지하고 Auto-Heal 파이프라인이 수정 PR을 생성합니다 — 최종 머지를 제외하면 사람의 개입이 필요 없습니다.

| 시도 | 동작 |
|------|------|
| 1~3회 | OpenCode가 수정 PR 생성 (`auto-heal` 라벨) |
| ≥4회 | 자동 치유 중단, `needs-human` 이슈 생성 |

자세히 보기 → [Auto-Heal 문서](https://ollama.devcomfort.me/ko/auto-heal/)

---

## 개발

### 요구사항

- [Node.js](https://nodejs.org) v22+
- [pnpm](https://pnpm.io) v10+
- [uv](https://docs.astral.sh/uv/) (Python)

### 설정

```bash
pnpm install        # Node.js 의존성
pnpm py:sync        # Python 의존성
```

### 명령어

| 명령어 | 설명 |
|--------|------|
| `pnpm dev` | API 개발 서버 시작 |
| `pnpm test` | 전체 테스트 실행 |
| `pnpm test:api` | API 테스트만 |
| `pnpm build` | 전체 패키지 빌드 |
| `pnpm type-check` | TypeScript 타입 체크 |
| `nx graph` | 프로젝트 의존성 그래프 시각화 |

### 프로젝트 구조

```
api/                  Cloudflare Workers API (Hono + Zod OpenAPI)
  src/routes/         HTTP 라우트 정의
  src/search/         검색 스크래퍼 + 핸들러
  src/model/          모델 스크래퍼
  src/health/         헬스 체크 로직
  src/lib/            캐시, fetchWithRetry 유틸리티
packages/
  ts-client/          TypeScript 클라이언트 (ollama-models)
  py-client/          Python 클라이언트 (ollama-models)
workers/
  alerts/             Tail Worker: 런타임 에러 → 이메일 알림
docs/                 문서 사이트 (Astro Starlight)
  src/pages/try/      인터랙티브 API 데모
scripts/              CI/CD 스크립트
```

---

## 라이선스

[BSD-3-Clause](LICENSE)
