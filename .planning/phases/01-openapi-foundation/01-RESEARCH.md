# Phase 1: OpenAPI Foundation - Research

**Researched:** 2026-04-05
**Domain:** @hono/zod-openapi · Zod v4 · Cloudflare Workers · Build-time spec generation
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPENAPI-01 | `api/src/` 응답 타입이 Zod 스키마(`api/src/schemas.ts`)로 정의 | Standard Stack 섹션, Zod 스키마 설계 섹션 |
| OPENAPI-02 | Hono 앱이 `OpenAPIHono`로 마이그레이션되고 모든 라우트가 `createRoute()`로 등록 | Migration Pattern 섹션, withCache 호환성 섹션 |
| OPENAPI-03 | `api/scripts/generate-openapi.ts` 실행 시 `api/openapi.json` 생성 | Build-time Spec Generation 섹션 |
| OPENAPI-04 | `pnpm build:spec`으로 빌드 시간에 `openapi.json` 재생성 가능 | Build-time Spec Generation 섹션 |
| OPENAPI-05 | `openapi.json`이 레포에 커밋되어 CI에서 drift 감지 가능 | Drift Detection 섹션 |
</phase_requirements>

---

## Summary

`@hono/zod-openapi@1.2.4`는 Hono 공식 middleware로, `OpenAPIHono` 클래스를 제공한다. 기존 `Hono<{ Bindings: Bindings }>`를 `OpenAPIHono<{ Bindings: Bindings }>`로 변경하고, `app.get(path, handler)` 패턴을 `createRoute()` + `app.openapi(route, handler)` 패턴으로 교체하는 것이 핵심 마이그레이션 작업이다. **Zod v4**(`^4.0.0`)가 요구된다 — `@hono/zod-openapi@1.2.4`와 `hono-openapi@1.3.0` 모두 `zod: '^4.0.0'` peer dep을 요구하므로 프로젝트는 Zod를 신규 설치해야 한다.

빌드 타임 spec 생성은 `app.getOpenAPIDocument(config)` 메서드를 `api/scripts/generate-openapi.ts`에서 직접 호출하는 방식으로 구현한다. 이 메서드는 순수 in-memory 연산이며 HTTP 서버 기동 없이 Node.js 컨텍스트에서 실행된다. `tsx`(`npx tsx`)로 실행하면 TypeScript 컴파일 없이 스크립트를 구동할 수 있다.

기존 `withCache` HOF(`(ttl, handler) => Handler`)는 서명을 `(ttl) => MiddlewareHandler`로 변경하여 `app.use(path, withCache(ttl))` + `app.openapi(route, handler)` 패턴으로 교체한다. Cloudflare `caches.default` 접근은 요청 시점에만 발생하므로 import 시 충돌하지 않고, 기존 테스트 stub도 그대로 동작한다.

**Primary recommendation:** `@hono/zod-openapi@1.2.4` + `zod@^4.0.0` 설치, `OpenAPIHono` 마이그레이션, `tsx`로 실행되는 build script 패턴 적용.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@hono/zod-openapi` | `1.2.4` | `OpenAPIHono` 클래스·`createRoute()`·`getOpenAPIDocument()` | Hono 공식 middleware (honojs org) |
| `zod` | `^4.0.0` | 스키마 정의 및 런타임 검증 | `@hono/zod-openapi`의 peer dep |
| `hono` | `^4.3.6` (최신 `4.12.10`) | HTTP 라우팅 (이미 설치) | peer dep 최소 버전 충족 필요 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsx` | `4.21.0` (npx) | TypeScript 스크립트 Node.js 실행 | `generate-openapi.ts` 실행용 devDependency |
| `@hono/zod-validator` | `0.7.6` | query/body validation (자동 installed as dep) | `@hono/zod-openapi` dep으로 자동 포함 |

### Internal Dependencies (자동 설치)

`@hono/zod-openapi`의 direct deps:
- `@asteasolutions/zod-to-openapi@^8.5.0` — Zod 스키마 → OpenAPI 스키마 변환 엔진
- `@hono/zod-validator@^0.7.6` — route-level Zod 검증 미들웨어
- `openapi3-ts@^4.5.0` — OpenAPI 3.x TypeScript 타입

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@hono/zod-openapi` | `hono-openapi@1.3.0` | hono-openapi는 schema-agnostic(valibot, typebox 지원)이지만 third-party; 이 프로젝트는 Zod 단독이므로 공식 패키지가 적합 |
| `z.union([z.number(), z.object(...)])` for PageRange | `z.number()` | PageRange 타입을 정확히 표현하려면 union 필요; 실제 API 응답은 숫자만 반환하므로 `z.number()`로 단순화 가능 |

### Installation

```bash
# api/ 디렉터리에서 실행
pnpm --filter ollama-models-api add zod @hono/zod-openapi
pnpm --filter ollama-models-api add -D tsx
# 기존 hono 버전이 ^4.0.0이므로 ^4.3.6 이상으로 업그레이드 필요
pnpm --filter ollama-models-api add hono@latest
```

**Version verification (2026-04-05에 npm registry 직접 확인):**
- `@hono/zod-openapi`: `1.2.4` [VERIFIED: npm registry]
- `hono-openapi`: `1.3.0` [VERIFIED: npm registry]
- `zod`: `4.3.6` 최신 [VERIFIED: npm registry]
- `hono`: `4.12.10` 최신 [VERIFIED: npm registry]
- `tsx`: `4.21.0` [VERIFIED: npm registry]

---

## Architecture Patterns

### Recommended File Structure

```
api/
├── src/
│   ├── schemas.ts          ← NEW: Zod 스키마 정의 (OPENAPI-01)
│   ├── index.ts            ← MIGRATE: OpenAPIHono + createRoute (OPENAPI-02)
│   ├── constants.ts        ← 변경 없음
│   ├── search/
│   │   ├── scraper.ts      ← 변경 없음
│   │   ├── types.ts        ← 변경 없음 (기존 TypeScript 타입 유지)
│   │   └── search.ts       ← 변경 없음
│   └── model/
│       ├── scraper.ts      ← 변경 없음
│       └── types.ts        ← 변경 없음 (기존 TypeScript 타입 유지)
├── scripts/
│   └── generate-openapi.ts ← NEW: build-time spec 생성 (OPENAPI-03)
├── openapi.json            ← GENERATED: 레포 커밋 대상 (OPENAPI-05)
└── package.json            ← build:spec 스크립트 추가 (OPENAPI-04)
```

> `types.ts` 파일들은 **유지**: scraper 내부에서 사용하는 타입이며, `schemas.ts`의 Zod 스키마는 별도 파일로 분리한다. 라우트 핸들러에서 `z.infer<typeof XxxSchema>` 타입을 검증에 사용한다.

---

### Pattern 1: OpenAPIHono App Setup (app 초기화)

```typescript
// api/src/index.ts
// Source: https://github.com/honojs/middleware/tree/main/packages/zod-openapi
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type { MiddlewareHandler } from 'hono';

type Bindings = {
  ALERT_WEBHOOK_URL?: string;
};

// OpenAPIHono는 Hono를 extends — Bindings 제네릭 동일하게 유지
const app = new OpenAPIHono<{ Bindings: Bindings }>();

app.use('*', cors());
```

---

### Pattern 2: createRoute + app.openapi (라우트 등록)

```typescript
// Source: https://github.com/honojs/middleware/tree/main/packages/zod-openapi
import { createRoute, z } from '@hono/zod-openapi';
// 주의: z는 @hono/zod-openapi에서 import (extendZodWithOpenApi 자동 적용됨)

const searchRoute = createRoute({
  method: 'get',
  path: '/search',
  request: {
    query: z.object({
      q: z.string().optional().openapi({ example: 'qwen3' }),
      page: z.string().optional().openapi({ example: '1' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: SearchResultSchema },
      },
      description: 'Search results',
    },
    500: {
      content: {
        'application/json': { schema: ErrorSchema },
      },
      description: 'Scraper error',
    },
  },
});

// withCache 미들웨어를 route 앞에 app.use()로 등록
app.use(searchRoute.getRoutingPath(), withCache(SEARCH_TTL));

app.openapi(searchRoute, async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const keyword = c.req.query('q') ?? '';
  try {
    const pages = await scrapeSearchPage(page, keyword);
    const result: SearchResult = { pages, page_range: page, keyword };
    return c.json(result, 200);
  } catch (err) {
    // ... alert logic ...
    return c.json({ error: String(err) }, 500);
  }
});
```

> **중요**: `app.openapi()`의 핸들러는 `c.json(data, 200)` 형식으로 상태 코드를 명시해야 한다. Hono `app.get()`의 `c.json(data)` (상태 코드 생략)와 다르다.

---

### Pattern 3: withCache HOF → MiddlewareHandler 변환

```typescript
// Source: Hono middleware pattern (VERIFIED: hono.dev docs)
import type { MiddlewareHandler } from 'hono';

// 기존 서명: withCache(ttl, handler): Handler — handler를 래핑
// 신규 서명: withCache(ttl): MiddlewareHandler — app.use()로 등록
function withCache(ttl: number): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (c, next) => {
    const cache = caches.default;
    const cacheKey = new Request(c.req.url);

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    await next(); // 이후 핸들러(app.openapi handler) 실행

    // c.res: next() 이후 핸들러가 설정한 Response
    const body = await c.res.clone().text();
    const fresh = new Response(body, {
      status: c.res.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    await cache.put(cacheKey, fresh.clone());
    c.res = fresh; // Response 교체
  };
}

// 사용 패턴:
app.use('/search', withCache(SEARCH_TTL));  // GET /search에만 실제로 적용됨
app.openapi(searchRoute, handler);

app.use('/model', withCache(MODEL_TTL));
app.openapi(modelRoute, handler);

// /health는 캐싱 없음 — app.use() 없이 바로 app.openapi()
app.openapi(healthRoute, handler);
```

---

### Pattern 4: Build-time Spec Generation Script

```typescript
// api/scripts/generate-openapi.ts
// Source: @hono/zod-openapi getOpenAPIDocument API (VERIFIED: source code inspection)
import { app } from '../src/index';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const spec = app.getOpenAPIDocument({
  openapi: '3.0.0',
  info: {
    title: 'ollama-models API',
    version: '0.1.0',
    description: 'Cloudflare Workers API to search and list Ollama model weights',
  },
  servers: [
    { url: 'https://ollama-models-api.devcomfort.workers.dev', description: 'Production' },
  ],
});

const outputPath = resolve(__dirname, '../openapi.json');
writeFileSync(outputPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`Generated: ${outputPath}`);
```

**실행 방법 (package.json에 추가):**

```json
{
  "scripts": {
    "build:spec": "tsx scripts/generate-openapi.ts"
  }
}
```

> `tsx`는 `api/` devDependency로 설치한다. `npx tsx`도 작동하지만 devDependency로 고정하는 것이 CI 환경에서 안전하다.

---

### Pattern 5: Export 유지 (`app.request()` for tests)

```typescript
// api/src/index.ts 하단 — 변경 없음
export { app };

export default {
  fetch: app.fetch,
  scheduled: async (event, env, ctx) => {
    // ...
  },
};
```

`OpenAPIHono`는 `Hono`를 extends하므로 `app.request()` 메서드가 그대로 존재한다. 기존 `index.test.ts`의 `app.request('/search?q=...')` 패턴은 수정 없이 작동한다.

---

### Anti-Patterns to Avoid

- **`z`를 `zod`에서 직접 import**: `import { z } from 'zod'`로 import하면 `.openapi()` 메서드가 없다. 반드시 `import { z } from '@hono/zod-openapi'`
- **상태 코드 생략**: `app.openapi()` 핸들러에서 `c.json(data)` 대신 `c.json(data, 200)` 필수
- **`app.doc()`를 build-time 생성에 사용**: `app.doc('/doc', config)`는 런타임 HTTP 엔드포인트를 추가한다. 파일 생성에는 `app.getOpenAPIDocument(config)` 사용
- **plain `Hono`와 `OpenAPIHono` 혼합**: `app.get()` / `app.post()` 등의 메서드는 `Hono` 타입을 반환한다. 필요한 경우 `$()` 유틸 또는 타입 캐스팅 사용

---

## Zod Schema Design

### api/src/schemas.ts 전체 설계

```typescript
// Source: @hono/zod-openapi official docs + existing types.ts inspection
import { z } from '@hono/zod-openapi';

// --- ModelPage (search/types.ts → schema) ---
export const ModelPageSchema = z
  .object({
    http_url: z.string().openapi({ example: 'https://ollama.com/library/qwen3' }),
    model_id: z.string().openapi({ example: 'library/qwen3' }),
  })
  .openapi('ModelPage');

// --- PageRange: number | { from, to } ---
// 실제 API 응답은 단일 숫자(page 파라미터)지만 타입은 union 허용
export const PageRangeSchema = z
  .union([
    z.number().int().min(1),
    z.object({
      from: z.number().int().min(1),
      to: z.number().int().min(1),
    }),
  ])
  .openapi('PageRange');

// --- SearchResult ---
export const SearchResultSchema = z
  .object({
    pages: z.array(ModelPageSchema),
    page_range: PageRangeSchema,
    keyword: z.string().openapi({ example: 'qwen3' }),
  })
  .openapi('SearchResult');

// --- ModelTags (model/types.ts → schema) ---
// 핵심: default_tag: string | null → z.string().nullable()
export const ModelTagsSchema = z
  .object({
    page_url: z.string().openapi({ example: 'https://ollama.com/library/qwen3' }),
    id: z.string().openapi({ example: 'library/qwen3' }),
    tags: z
      .array(z.string())
      .openapi({ example: ['qwen3:latest', 'qwen3:4b', 'qwen3:8b'] }),
    default_tag: z
      .string()
      .nullable()
      .openapi({ example: 'qwen3:latest', description: 'null when no "latest" tag exists' }),
  })
  .openapi('ModelTags');

// --- Health check schemas ---
export const CheckResultSchema = z
  .object({
    ok: z.boolean(),
    count: z.number().int().optional().openapi({ example: 5 }),
    error: z.string().optional().openapi({ example: 'Error: selector returned 0 results' }),
  })
  .openapi('CheckResult');

export const HealthStatusSchema = z
  .object({
    ok: z.boolean().openapi({ example: true }),
    timestamp: z.string().openapi({ example: '2026-01-01T00:00:00.000Z' }),
    checks: z.object({
      search: CheckResultSchema,
      model: CheckResultSchema,
    }),
  })
  .openapi('HealthStatus');

// --- Error response ---
export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'Error: selector returned 0 results' }),
  })
  .openapi('ApiError');
```

### nullable 처리 상세

`default_tag: string | null`은 OpenAPI 3.0에서 `{ type: 'string', nullable: true }`로 표현된다.

```typescript
// Zod v4에서 nullable 표현 방법
z.string().nullable()   // ✅ string | null → OpenAPI: { type: 'string', nullable: true }
z.nullable(z.string())  // ✅ 동일
z.union([z.string(), z.null()])  // ✅ 동일 (但 spec 출력이 oneOf로 달라질 수 있음)
```

`@asteasolutions/zod-to-openapi@8.x`는 `.nullable()`을 OpenAPI 3.0의 `nullable: true`로 변환한다. [VERIFIED: @hono/zod-openapi source code deps inspection]

---

## withCache HOF Compatibility

### 기존 구조 분석

```typescript
// 현재 패턴 (index.ts)
function withCache(ttl, handler: Handler<{ Bindings }>): Handler<{ Bindings }> {
  return async (c) => {
    // ...
    const res = await handler(c, () => Promise.resolve()); // handler 직접 호출
    // ...
  };
}
app.get('/search', withCache(SEARCH_TTL, async (c) => { ... }));
```

### 신규 패턴 (OpenAPIHono compatible)

```typescript
// 변경 후: handler를 인수로 받지 않고 MiddlewareHandler 반환
function withCache(ttl: number): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (c, next) => {
    // cache hit → 즉시 return (next 호출 안 함)
    const cached = await caches.default.match(new Request(c.req.url));
    if (cached) return cached;
    
    await next(); // app.openapi handler 실행
    
    // cache miss → c.res에 핸들러 응답이 있음
    const body = await c.res.clone().text();
    const fresh = new Response(body, {
      status: c.res.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    await caches.default.put(new Request(c.req.url), fresh.clone());
    c.res = fresh;
  };
}
```

### Worker 런타임 호환성

- `caches.default`: Cloudflare Workers 전용 global — Worker 런타임에서만 사용 가능 [VERIFIED: @cloudflare/workers-types]
- Node.js (vitest) 환경에서는 `setup.ts`가 이미 `caches` stub을 제공한다
- **import 시 안전**: `withCache(ttl)` 호출은 closure를 생성할 뿐, `caches.default`는 미들웨어가 실제 실행될 때만 접근한다
- build script에서 `app`을 import → `app.getOpenAPIDocument()` 호출 시 `caches.default` 접근 없음 ✅

---

## Build-time Spec Generation Details

### getOpenAPIDocument() 동작 원리

`app.getOpenAPIDocument(config)`는 `app.openAPIRegistry.definitions`를 순회하여 OpenAPI 스키마를 in-memory에서 생성한다. HTTP 서버 기동 없이 import 후 즉시 호출 가능. [VERIFIED: source code at honojs/middleware/packages/zod-openapi/src/index.ts]

```typescript
// OpenAPIHono 내부 (간략화)
getOpenAPIDocument = (objectConfig, generatorConfig) => {
  const generator = new OpenApiGeneratorV3(
    this.openAPIRegistry.definitions,
    generatorConfig
  );
  return generator.generateDocument(objectConfig);
};
```

### tsx 선택 이유

| 도구 | 상태 | 이유 |
|------|------|------|
| `tsx` | ✅ 권장 | ESM-native, `--import` 없이 `.ts` 파일 직접 실행, Node.js v22 완전 호환 |
| `ts-node` | ⚠️ 비권장 | ESM 처리가 복잡, `--esm` 플래그 필요 |
| `vitest run scripts/...` | ❌ 비적합 | test runner, 파일 시스템 write에 부적합 |
| `wrangler dev` | ❌ 비적합 | Worker 런타임 — `node:fs` 없음 |

### pnpm 스크립트 추가 위치

```json
// api/package.json
{
  "scripts": {
    "build:spec": "tsx scripts/generate-openapi.ts"
  }
}
```

```json
// 루트 package.json (선택적)
{
  "scripts": {
    "build:spec": "pnpm --filter ollama-models-api build:spec"
  }
}
```

### Drift Detection (OPENAPI-05) 패턴

CI에서 spec drift를 감지하려면:
```bash
pnpm build:spec
git diff --exit-code api/openapi.json
```
`openapi.json`이 커밋된 파일과 다르면 `git diff --exit-code`가 non-zero exit code를 반환한다. 이 패턴은 Phase 3 CI 구현에서 사용된다. Phase 1에서는 `openapi.json`을 최초 생성하고 커밋하는 것이 목표.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `tsx` 스크립트 실행 | ✓ | v22.22.0 | — |
| pnpm | 패키지 관리 | ✓ | workspace 설정 확인됨 | — |
| `tsx` | `generate-openapi.ts` 실행 | ✓ (npx) | 4.21.0 via npx | devDep으로 설치 권장 |
| `wrangler` | Worker 빌드/배포 | ✓ (devDep) | ^4.0.0 | — |
| `caches` (CF Workers) | `withCache` middleware | Workers runtime only | N/A | 기존 vitest stub 있음 |

**Missing dependencies with no fallback:** 없음

**Missing dependencies with fallback:**
- `tsx`: `npx tsx`로 fallback 가능하나 devDep 설치 권장

---

## Common Pitfalls

### Pitfall 1: z를 zod에서 직접 import

**What goes wrong:** `.openapi()` 메서드가 없어 TypeScript 컴파일 에러 발생
**Why it happens:** `@hono/zod-openapi`는 내부적으로 `extendZodWithOpenApi(z)`를 호출하여 `z` 인스턴스에 `.openapi()` 메서드를 추가한다
**How to avoid:** 반드시 `import { z } from '@hono/zod-openapi'` 사용. `import { z } from 'zod'` 사용 금지.
**Warning signs:** `Property 'openapi' does not exist on type 'ZodObject<...>'`

### Pitfall 2: app.openapi() 핸들러에서 상태 코드 생략

**What goes wrong:** TypeScript 타입 에러 또는 런타임 응답 불일치
**Why it happens:** `app.openapi()`는 route 정의의 responds와 타입-레벨 매칭을 수행하므로 상태 코드 명시 필수
**How to avoid:** `return c.json(data, 200)` — 200이라도 반드시 명시
**Warning signs:** 타입 에러 `Type 'Context<...>' has no call signature` 혹은 response status 불일치

### Pitfall 3: withCache 미들웨어 등록 순서

**What goes wrong:** 캐싱이 동작하지 않거나 미들웨어가 route에 적용되지 않음
**Why it happens:** Hono는 등록 순서대로 미들웨어를 처리한다. `app.use()` → `app.openapi()` 순서여야 한다.
**How to avoid:** `app.use(path, withCache(ttl))`를 반드시 `app.openapi(route, handler)` **앞에** 등록
**Warning signs:** 캐시 hit이 never; 또는 미들웨어 실행 로그가 없음

### Pitfall 4: Hono 버전 peer dep 충돌

**What goes wrong:** pnpm install 시 peer dep 경고 또는 타입 불일치
**Why it happens:** `@hono/zod-openapi@1.2.4`는 `hono: '>=4.3.6'` 요구. 기존 `package.json`의 `hono: '^4.0.0'`은 4.0.x~4.2.x로 해석될 수 있다.
**How to avoid:** `pnpm --filter ollama-models-api add hono@latest` 실행 (`4.12.10` 설치)
**Warning signs:** `peer dep not found: hono@^4.3.6` 경고

### Pitfall 5: PageRange union schema와 OpenAPI 3.0 표현

**What goes wrong:** `z.union([z.number(), z.object(...)])` → OpenAPI spec에서 `oneOf`로 표현되어 클라이언트 코드 생성시 복잡해질 수 있음
**Why it happens:** OpenAPI 3.0은 polymorphic type을 `oneOf`로만 표현 가능
**How to avoid:** 현재 API 구현이 항상 단일 숫자를 반환하므로 `z.number().int().min(1)`로 단순화하는 것도 실용적 대안. 단, TypeScript 타입과 diverge됨.
**Warning signs:** 생성된 spec의 `page_range` 필드가 `oneOf: [{type: number}, {type: object}]`로 복잡하게 표현됨

### Pitfall 6: Zod v4 breaking changes — 이 프로젝트에 해당 없음

**What goes wrong:** Zod v3 → v4 마이그레이션 시 일부 API 변경
**Why it happens:** 이 프로젝트는 Zod를 현재 사용하지 않으므로 v3→v4 마이그레이션 이슈가 없다. 신규 설치이므로 처음부터 v4 API 사용.
**How to avoid:** Zod를 신규 설치. 기존 `zod` import가 없으므로 마이그레이션 불필요.
**Warning signs:** N/A — 신규 설치이므로 없음

### Pitfall 7: generate script에서 node:fs import 이슈

**What goes wrong:** `import { writeFileSync } from 'fs'` 가 Worker 빌드에 포함될 경우 오류
**Why it happens:** script는 Worker 번들에 포함되어서는 안 됨. `tsconfig.json`의 `files`/`include` 범위 주의.
**How to avoid:** `api/scripts/` 디렉터리를 `api/tsconfig.json`의 `include`에서 제외하거나, 스크립트 전용 tsconfig 사용. 또는 `node:fs` prefix 사용 (`import { writeFileSync } from 'node:fs'`).
**Warning signs:** wrangler build 시 `Cannot find module 'fs'` — Workers에는 `node:fs` 없음

---

## Code Examples

### Complete searchRoute 정의

```typescript
// Source: @hono/zod-openapi README (VERIFIED)
import { createRoute, z } from '@hono/zod-openapi';
import { SearchResultSchema, ErrorSchema } from './schemas';

export const searchRoute = createRoute({
  method: 'get',
  path: '/search',
  request: {
    query: z.object({
      q: z.string().default('').openapi({ param: { name: 'q', in: 'query' }, example: 'qwen3' }),
      page: z
        .string()
        .optional()
        .transform((v) => Math.max(1, parseInt(v ?? '1', 10) || 1))
        .openapi({ param: { name: 'page', in: 'query' }, example: '1' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SearchResultSchema } },
      description: 'Search results',
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Scraper error',
    },
  },
});
```

> ⚠️ query param validation은 string으로 수신된다. `page` 파라미터는 `z.string().transform()`으로 number 변환이 필요하다. 또는 transform 없이 핸들러에서 직접 파싱하는 현재 방식을 유지할 수 있다 (query schema를 느슨하게 정의).

### modelRoute 정의

```typescript
export const modelRoute = createRoute({
  method: 'get',
  path: '/model',
  request: {
    query: z.object({
      name: z.string().openapi({
        param: { name: 'name', in: 'query' },
        example: 'library/qwen3',
        description: 'Model path (e.g. library/qwen3, username/model-name, or full URL)',
      }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ModelTagsSchema } },
      description: 'Model tags',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid name parameter',
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Scraper error',
    },
  },
});
```

### healthRoute 정의

```typescript
export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      content: { 'application/json': { schema: HealthStatusSchema } },
      description: 'All scrapers healthy',
    },
    503: {
      content: { 'application/json': { schema: HealthStatusSchema } },
      description: 'One or more scrapers unhealthy',
    },
  },
});

// health는 캐싱 없음
app.openapi(healthRoute, async (c) => {
  const status = await runHealthCheck();
  return c.json(status, status.ok ? 200 : 503);
});
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `c.res` 설정(`c.res = fresh`)이 Hono v4.12.x middleware에서 정상 작동 | withCache Pattern | middleware 응답 교체 불가 → withCache 재설계 필요 |
| A2 | `tsx scripts/generate-openapi.ts` ESM import 환경에서 `api/src/index.ts`가 에러 없이 import 가능 | Build-time Generation | scripts 실행 시 Worker-specific global (`caches` 등) crash → setup.ts 없이 caches stub 필요 |

> **A2 mitigation**: build script 상단에 `caches` global stub을 직접 추가하거나, vitest의 `setup.ts` 내용을 `scripts/setup-node-globals.ts`로 분리하여 `tsx --require ./scripts/setup-node-globals.ts scripts/generate-openapi.ts` 패턴으로 실행 가능.

---

## Open Questions

1. **query param transform in createRoute**
   - What we know: `page` 파라미터는 string으로 수신 후 number로 변환 필요
   - What's unclear: `z.string().transform()`을 createRoute query schema에 사용 시 `c.req.valid('query').page`의 타입이 `number`로 추론되는지
   - Recommendation: transform을 query schema에서 제거하고 핸들러에서 `parseInt()` 직접 사용 (기존 방식 유지) — 더 안전하고 명확

2. **`api/tsconfig.json` include 범위**
   - What we know: Worker 빌드 진입점은 `src/index.ts`. `scripts/` 디렉터리는 Worker 번들에 포함되면 안 됨
   - What's unclear: 현재 `tsconfig.json`에 `include`/`files` 설정이 명시되어 있는지
   - Recommendation: `scripts/` 전용 `tsconfig.scripts.json` 생성 또는 `tsconfig.json`에 `exclude: ["scripts"]` 추가

---

## Sources

### Primary (HIGH confidence)
- `@hono/zod-openapi` source code (honojs/middleware) — `getOpenAPIDocument()` 동작, `OpenAPIHono` API 확인
- `@hono/zod-openapi` README (github.com/honojs/middleware/packages/zod-openapi) — 기본 사용 패턴
- npm registry — `@hono/zod-openapi@1.2.4`, `hono@4.12.10`, `zod@4.3.6`, `tsx@4.21.0` 버전 직접 확인

### Secondary (MEDIUM confidence)
- Zod v4 migration guide (zod.dev/v4/changelog) — 이 프로젝트에서 Zod 신규 설치이므로 마이그레이션 이슈 없음 확인
- hono.dev/examples/zod-openapi — 기본 사용 패턴 검증

### Tertiary (LOW confidence)
- `c.res` mutation pattern in Hono middleware — Hono docs에서 확인, 하지만 `withCache`의 실제 동작은 구현 후 테스트 필요 [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry 직접 확인
- Architecture patterns: HIGH — 공식 소스 코드·README 확인
- withCache migration: MEDIUM — Hono middleware `c.res` mutation 패턴은 well-known이나 실제 테스트 미확인
- Build-time script: HIGH — `getOpenAPIDocument()` 소스 코드 확인 (순수 in-memory)
- Zod v4 schemas: HIGH — 공식 migration guide + peer dep 확인

**Research date:** 2026-04-05
**Valid until:** 2026-07-05 (hono stable release cycle 기준 90일)
