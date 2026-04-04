# ARCHITECTURE.md — 아키텍처 연구

## 목표 아키텍처

```
[api/src/index.ts] — OpenAPIHono 기반 라우터
        │
        │  app.getOpenAPIDocument()
        ▼
[api/scripts/generate-openapi.ts]
        │  tsx 실행
        ▼
[api/openapi.json]  ←── 단일 진실의 원천 (Single Source of Truth)
        │
        ├── [packages/ts-client/scripts/validate-schema.ts]
        │      └── TS 타입(schemas.ts) vs openapi.json 필드 비교
        │
        └── [packages/py-client/scripts/validate_schema.py]
               └── Python dataclass(types.py) vs openapi.json 필드 비교
                        │
                        ▼
              [.github/workflows/ci.yml]
              ├── wrangler dev & (백그라운드 서버)
              ├── pnpm test:api (기존 단위 테스트)
              ├── pnpm test:ts (기존 단위 테스트)
              ├── rye run pytest (기존 단위 테스트)
              ├── pnpm test:integration:ts (새 통합 테스트)
              └── rye run pytest tests/integration/ (새 통합 테스트)
```

## 컴포넌트 설계

### 1. API — OpenAPIHono 마이그레이션

**변경 파일:** `api/src/index.ts`, 새 파일 `api/src/schemas.ts`

```typescript
// api/src/schemas.ts (새 파일)
import { z } from '@hono/zod-openapi'

export const SearchResultSchema = z.object({
  pages: z.array(z.object({
    http_url: z.string(),
    model_id: z.string(),
  })),
  page_range: z.union([z.number(), z.object({ from: z.number(), to: z.number() })]),
  keyword: z.string(),
})
// + ModelTagsSchema, HealthStatusSchema

// api/src/index.ts
import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
// ...
const app = new OpenAPIHono()
app.openapi(createRoute({
  method: 'get',
  path: '/search',
  tags: ['Search'],
  request: { query: SearchQuerySchema },
  responses: { 200: { content: { 'application/json': { schema: SearchResultSchema } } } },
}), handler)
```

**주의:** 기존 `withCache()` HOF는 `Handler` 타입을 사용하므로 `OpenAPIHono` 컨텍스트 타입과 호환성 확인 필요.

### 2. 빌드 스크립트

**새 파일:** `api/scripts/generate-openapi.ts`

```typescript
// api/scripts/generate-openapi.ts
import { app } from '../src/index'
import { writeFileSync } from 'fs'

const spec = app.getOpenAPIDocument({
  openapi: '3.0.0',
  info: { title: 'ollama-models API', version: '0.1.0' },
  servers: [{ url: 'https://ollama-models-api.devcomfort.workers.dev' }],
})
writeFileSync('./openapi.json', JSON.stringify(spec, null, 2))
```

**패키지 스크립트:**
```json
"generate:openapi": "tsx scripts/generate-openapi.ts",
"build:openapi": "pnpm generate:openapi",
```

### 3. TS 클라이언트 검증

**전략:** `assertXxx()` 함수 시그니처와 openapi.json 응답 스키마 필드 이름을 비교.

- 검증 스크립트: `packages/ts-client/scripts/validate-schema.ts`
- 입력: `../../api/openapi.json`
- 검사 항목: 모든 응답 스키마 필드가 클라이언트 타입에 존재하는지 (추가/삭제/이름 변경)

### 4. Python 클라이언트 검증

**전략:** 각 endpoint 응답 스펙의 properties를 dataclass 필드와 비교.

- 검증 스크립트: `packages/py-client/scripts/validate_schema.py`
- 입력: `../../api/openapi.json`
- 검사 항목: dataclass 필드명과 타입이 spec properties와 일치하는지

### 5. GitHub Actions

**파일:** `.github/workflows/ci.yml`

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - name: Install deps
      - name: Generate OpenAPI spec
        run: pnpm --filter ollama-models-api generate:openapi
      - name: Validate TS client schema
        run: pnpm --filter @devcomfort/ollama-models validate:schema
      - name: Validate Python client schema
        run: cd packages/py-client && rye run python scripts/validate_schema.py
      - name: Run unit tests
        run: pnpm test:api && pnpm test:ts
      - name: Run Python unit tests
        run: cd packages/py-client && rye run pytest tests/unit/
      - name: Start wrangler dev server
        run: pnpm --filter ollama-models-api dev &
        # + wait-on 또는 sleep으로 서버 준비 대기
      - name: Run TS integration tests
        run: pnpm --filter @devcomfort/ollama-models test:integration
      - name: Run Python integration tests
        run: cd packages/py-client && rye run pytest tests/integration/
```

## 빌드 순서 (의존성)

1. `api/` → OpenAPIHono 마이그레이션 (기존 테스트 통과 유지)
2. `api/scripts/generate-openapi.ts` 작성 + `openapi.json` 생성 확인
3. TS/Python 클라이언트 검증 스크립트 작성
4. 각 클라이언트 통합 테스트 작성
5. GitHub Actions 워크플로우 작성
