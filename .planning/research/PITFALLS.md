# PITFALLS.md — 함정과 예방 전략

## 고위험 함정

### 1. `withCache()` HOF와 OpenAPIHono 핸들러 타입 충돌

**증상:** `withCache(ttl, handler)` 가 `Handler<{ Bindings }>` 타입을 받는데, `app.openapi()` 핸들러는 다른 컨텍스트 타입을 가짐.

**예방:** `withCache`를 `OpenAPIHono` 핸들러 타입과 호환되도록 제네릭 타입 파라미터 업데이트. 또는 캐시 로직을 Hono 미들웨어 방식으로 리팩토링.

**감지:** 마이그레이션 후 TypeScript 컴파일 에러.

**담당 페이즈:** API 마이그레이션 단계.

### 2. `wrangler dev`가 GitHub Actions에서 백그라운드 실행 후 준비 전에 테스트 시작

**증상:** 통합 테스트가 `ECONNREFUSED`로 실패. 서버가 아직 포트를 열지 않은 상태.

**예방:** `wait-on` 패키지 또는 `curl --retry` 루프로 서버 준비 대기:
```bash
npx wait-on http://localhost:8787/health --timeout 30000
# 또는
for i in {1..30}; do curl -sf http://localhost:8787/health && break; sleep 1; done
```

**담당 페이즈:** GitHub Actions 워크플로우 작성.

### 3. Cloudflare account_id가 wrangler dev 실행에 필요

**증상:** CI에서 `wrangler dev` 실행 시 인증 오류. `wrangler.toml`에 하드코딩된 `account_id`가 있지만 `CLOUDFLARE_ACCOUNT_ID` 환경변수나 시크릿이 필요할 수 있음.

**예방:** `wrangler dev --local` 플래그 사용 (Miniflare 기반 로컬 실행, Cloudflare 계정 불필요). `wrangler.toml`의 `account_id` 제거 또는 GitHub Secret으로 이동.

**담당 페이즈:** GitHub Actions 워크플로우 작성.

### 4. Python 3.8에서 `jsonschema` 타입 힌트 문제

**증상:** `jsonschema` 4.x는 Python 3.8을 지원하지만, 일부 타입 힌트 (`X | Y` 문법)를 사용하면 오류 발생.

**예방:** 검증 스크립트에서 `from __future__ import annotations` 사용. `jsonschema` 대신 단순 딕셔너리 비교 스크립트로 대체 가능 (의존성 최소화).

**담당 페이즈:** Python 검증 스크립트 작성.

## 중위험 함정

### 5. Zod nullable vs optional 혼동

**증상:** `null` 가능한 필드 (e.g. `default_tag: string | null`)를 `.optional()` 로 정의하면 OpenAPI spec에서 `nullable: true` 대신 `required` 목록에서 제외됨.

**예방:** `null`이 가능한 필드는 반드시 `.nullable()` 사용:
```typescript
default_tag: z.string().nullable()  // ✅
default_tag: z.string().optional()  // ❌ null이 아닌 undefined 처리
```

**담당 페이즈:** API OpenAPIHono 마이그레이션.

### 6. `crons` 트리거와 `app.fetch` 동시 내보내기 패턴

**증상:** `OpenAPIHono`로 전환 후 `export default { fetch: app.fetch, scheduled }` 패턴이 types 충돌.

**예방:** Hono의 `app.fetch` 속성은 `OpenAPIHono`에서도 동일하게 존재. `export default app` 사용 시 cron 핸들러 (`scheduled`)가 사라지므로, 객체 내보내기 패턴 유지:
```typescript
export default {
  fetch: app.fetch,
  scheduled: async (_event, env, _ctx) => { ... }
}
```

**담당 페이즈:** API 마이그레이션.

### 7. TS 클라이언트의 `PageRange` union 타입 OpenAPI 표현

**증상:** `PageRange = number | { from: number; to: number }` → OpenAPI로 표현 시 `oneOf`/`anyOf` 사용 필요. 일부 클라이언트 생성기나 검증기에서 처리 어려울 수 있음.

**예방:** `z.union([z.number(), z.object({...})])` 으로 정의하면 `@hono/zod-openapi`가 올바른 `oneOf` 스키마 자동 생성. 검증 스크립트에서 이 케이스 명시적으로 처리.

**담당 페이즈:** 스키마 정의.

## 저위험 함정

### 8. 통합 테스트가 실제 ollama.com에 의존

**증상:** CI 통합 테스트가 `wrangler dev` 경유로 실제 ollama.com 스크래핑 → CI 불안정, 속도 저하.

**예방:** 통합 테스트는 API 스펙 준수 여부(응답 스키마 형식)만 확인하고, 지정된 모델이 실제로 존재하는지는 검증하지 않음. 또는 테스트용 모델명을 `library/tinyllama` 같은 안정적인 소형 모델로 고정.

**담당 페이즈:** 통합 테스트 작성.
