# STACK.md — 기술 스택 연구

## 현재 스택 (기존)

| 영역 | 기술 |
|---|---|
| API 런타임 | Cloudflare Workers (wrangler ^4.0.0) |
| HTTP 프레임워크 | Hono ^4.0.0 |
| HTML 파싱 | node-html-parser ^7.1.0 |
| 유틸리티 | es-toolkit ^1.45.1 |
| TS 클라이언트 번들러 | tsup ^8.0.0 |
| Python 패키지 매니저 | rye |
| Python HTTP 클라이언트 | httpx ^0.27.0 |

## 추가 필요 스택

### @hono/zod-openapi (최신: 0.19.x)

**근거:** 공식 Hono 미들웨어 모노레포에서 관리. Cloudflare Workers 공식 지원 ("For Cloudflare Workers and Bun, use this entry point: `export default app`").

```bash
pnpm add @hono/zod-openapi zod
```

**핵심 API:**
- `OpenAPIHono` — `Hono` 대신 사용하는 확장 클래스
- `createRoute()` — 라우트 정의 (Zod 스키마 + OpenAPI 메타데이터 포함)
- `app.getOpenAPIDocument(config)` — OpenAPI 3.0 스펙 객체 반환 (빌드 스크립트에서 사용)
- `app.doc31('/openapi.json', config)` — OpenAPI 3.1 엔드포인트 서빙

**마이그레이션 비용 (낮음):**
1. `import { Hono } from 'hono'` → `import { OpenAPIHono, createRoute } from '@hono/zod-openapi'`
2. `new Hono()` → `new OpenAPIHono()`
3. `app.get('/search', handler)` → `app.openapi(createRoute({...}), handler)`
4. 기존 타입 인터페이스를 Zod 스키마로 교체 (z.object → 기존 TypeScript 인터페이스와 동일한 형태)

### 빌드 스크립트 의존성

```json
// package.json (api/devDependencies)
"tsx": "^4.0.0"   // .ts 스크립트 실행용
```

### Python: jsonschema 검증

```toml
# pyproject.toml devDependencies
"jsonschema>=4.0.0"   // Python 3.8+ 지원, OpenAPI spec 검증
```

## 버전 호환성 확인

| 패키지 | 현재 | 추천 | 이유 |
|---|---|---|---|
| hono | ^4.0.0 | ^4.7.0 | @hono/zod-openapi 0.19.x 의존성 |
| @hono/zod-openapi | 없음 | ^0.19.0 | 최신 안정 버전 |
| zod | 없음 | ^3.24.0 | @hono/zod-openapi와 peerDependency |

**신뢰도:** 높음 — Hono 공식 미들웨어, Workers 전용 예제 공식 문서에 존재
