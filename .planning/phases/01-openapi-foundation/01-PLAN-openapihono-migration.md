---
phase: 1
name: "OpenAPIHono Migration"
wave: 2
depends_on: [01-PLAN-zod-schemas]
requirements: [OPENAPI-02]
files_modified:
  - api/package.json
  - api/src/index.ts
autonomous: true

must_haves:
  truths:
    - "app 이 OpenAPIHono<{ Bindings }> 인스턴스다"
    - "/search, /model, /health 세 라우트 모두 createRoute() + app.openapi() 로 등록된다"
    - "withCache 가 MiddlewareHandler 를 반환하고 app.use() + app.openapi() 패턴으로 사용된다"
    - "기존 단위 테스트(index.test.ts)가 변경 없이 통과한다"
  artifacts:
    - path: "api/package.json"
      provides: "zod@^4.0.0, @hono/zod-openapi@1.2.4, tsx devDep"
      contains: "@hono/zod-openapi"
    - path: "api/src/index.ts"
      provides: "OpenAPIHono 앱 + createRoute 라우트 3개"
      exports: [app]
  key_links:
    - from: "api/src/index.ts"
      to: "api/src/schemas.ts"
      via: "named import"
      pattern: "from './schemas'"
    - from: "api/src/index.ts (withCache)"
      to: "app.use(path, ...)"
      via: "MiddlewareHandler 반환"
      pattern: "app\\.use\\("
    - from: "api/src/index.ts (route)"
      to: "app.openapi(route, handler)"
      via: "createRoute 라우트 객체"
      pattern: "app\\.openapi\\("
---

# Plan: OpenAPIHono Migration

## Goal
`zod`, `@hono/zod-openapi` 패키지를 설치하고, `api/src/index.ts` 를 `OpenAPIHono` 기반으로
마이그레이션한다. `withCache` HOF 의 시그니처를 변경하고, 세 라우트를
`createRoute()` + `app.openapi()` 패턴으로 교체한다. 기존 `app.request()` 테스트는
`OpenAPIHono extends Hono` 이므로 수정 없이 통과해야 한다.

## Tasks

### Task 1: Install Dependencies

<read_first>
- api/package.json — 현재 deps 버전 확인 (hono ^4.0.0 → latest 필요)
</read_first>

<action>
아래 명령을 `api/` 디렉터리에서 실행한다.

```bash
cd /home/devcomfort/ollama-models
# zod v4 + hono/zod-openapi 설치 (runtime deps)
pnpm --filter ollama-models-api add zod@^4.0.0 @hono/zod-openapi@1.2.4
# hono 를 latest(4.12.10)로 업그레이드 — peer dep >=4.3.6 충족
pnpm --filter ollama-models-api add hono@latest
# tsx devDep — generate-openapi.ts 실행용 (Plan 03 에서 사용)
pnpm --filter ollama-models-api add -D tsx
```

설치 후 `api/package.json` 에 아래 항목이 있어야 한다:
```json
{
  "dependencies": {
    "zod": "^4.x.x",
    "@hono/zod-openapi": "^1.2.4",
    "hono": "^4.12.x 또는 latest"
  },
  "devDependencies": {
    "tsx": "^4.x.x"
  }
}
```

완료 후 기존 테스트가 여전히 통과하는지 확인한다:
```bash
pnpm --filter ollama-models-api test
```
</action>

<acceptance_criteria>
- [ ] `grep -q '"@hono/zod-openapi"' api/package.json`
- [ ] `grep -q '"zod"' api/package.json`
- [ ] `grep -q '"tsx"' api/package.json`
- [ ] `node -e "require('./api/node_modules/@hono/zod-openapi')" 2>/dev/null || pnpm --filter ollama-models-api test` (패키지 설치 확인)
- [ ] `pnpm --filter ollama-models-api test` 가 0 exit code로 종료 (기존 테스트 모두 통과)
</acceptance_criteria>

---

### Task 2: Migrate `api/src/index.ts` to OpenAPIHono

<read_first>
- api/src/index.ts — 현재 전체 파일 숙지 (withCache 시그니처, 3개 라우트, exports)
- api/src/schemas.ts — Plan 01 결과물 (import 대상)
- api/src/__tests__/index.test.ts — app.request() 호출 패턴 확인 (변경 금지)
- api/src/__tests__/setup.ts — caches.default stub 확인 (withCache 변경 후에도 작동)
</read_first>

<action>
`api/src/index.ts` 를 아래 사항에 따라 전면 재작성한다.
**기존 비즈니스 로직(sendAlert, buildHealthAlertMessage, runHealthCheck, PROBE_MODEL, PROBE_KEYWORD)은
그대로 유지한다.** 변경 범위: import, app 초기화, withCache, 라우트 3개.

#### 1. Import 변경

```typescript
// 삭제
import { Hono } from 'hono';
import type { Handler } from 'hono';

// 추가
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import {
  SearchResultSchema,
  ModelTagsSchema,
  HealthStatusSchema,
  ErrorSchema,
} from './schemas';
```

`scrapeSearchPage`, `scrapeModelPage`, `OLLAMA_BASE`, `ModelPage` import 는 **유지**.

#### 2. app 초기화

```typescript
// 변경 전
const app = new Hono<{ Bindings: Bindings }>();

// 변경 후
const app = new OpenAPIHono<{ Bindings: Bindings }>();
```

`app.use('*', cors())` 호출은 그대로 유지.

#### 3. withCache HOF 시그니처 변경

```typescript
// 변경 전 시그니처
function withCache(
  ttl: number,
  handler: Handler<{ Bindings: Bindings }>,
): Handler<{ Bindings: Bindings }> {
  return async (c) => {
    // ...
    const res = await handler(c, () => Promise.resolve());
    // ...
  };
}

// 변경 후 시그니처 — handler 인수 제거, MiddlewareHandler 반환
function withCache(ttl: number): MiddlewareHandler<{ Bindings: Bindings }> {
  return async (c, next) => {
    const cache = caches.default;
    const cacheKey = new Request(c.req.url);

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    await next(); // app.openapi handler 실행 → c.res 에 응답이 채워짐

    const body = await c.res.clone().text();
    const fresh = new Response(body, {
      status: c.res.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    await cache.put(cacheKey, fresh.clone());
    c.res = fresh;
  };
}
```

TSDoc: `@param ttl - Cache lifetime in seconds.` / `@returns MiddlewareHandler that caches the downstream response.`

#### 4. `/search` 라우트 정의 및 등록

```typescript
const searchRoute = createRoute({
  method: 'get',
  path: '/search',
  request: {
    query: z.object({
      q: z.string().optional().openapi({ param: { name: 'q', in: 'query' }, example: 'qwen3' }),
      page: z.string().optional().openapi({ param: { name: 'page', in: 'query' }, example: '1' }),
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

// withCache 미들웨어를 반드시 app.openapi() 앞에 등록
app.use(searchRoute.getRoutingPath(), withCache(SEARCH_TTL));

app.openapi(searchRoute, async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const keyword = c.req.query('q') ?? '';

  try {
    const pages = await scrapeSearchPage(page, keyword);
    const result = { pages, page_range: page, keyword };
    return c.json(result, 200); // 상태 코드 명시 필수
  } catch (err) {
    if (c.env?.ALERT_WEBHOOK_URL) {
      // ... 기존 sendAlert 로직 동일 유지 ...
    }
    return c.json({ error: String(err) }, 500);
  }
});
```

#### 5. `/model` 라우트 정의 및 등록

```typescript
const modelRoute = createRoute({
  method: 'get',
  path: '/model',
  request: {
    query: z.object({
      name: z.string().optional().openapi({ param: { name: 'name', in: 'query' }, example: 'library/qwen3' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: ModelTagsSchema } },
      description: 'Model tags',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Missing or invalid name parameter',
    },
    500: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Scraper error',
    },
  },
});

app.use(modelRoute.getRoutingPath(), withCache(MODEL_TTL));

app.openapi(modelRoute, async (c) => {
  const name = c.req.query('name') ?? '';
  if (!name.trim()) {
    return c.json({ error: '`name` query parameter is required' }, 400);
  }

  const path = name
    .replace(/^(?:https?:\/\/ollama\.com)?\/+/, '')
    .replace(/\/tags\/?$/, '');

  if (!path.includes('/')) {
    return c.json(
      { error: `Invalid name "${name}": pass "library/${path}" for official models or "username/${path}" for community models.` },
      400,
    );
  }

  try {
    const modelPage: ModelPage = {
      http_url: `${OLLAMA_BASE}/${path}`,
      model_id: path,
    };
    const result = await scrapeModelPage(modelPage);
    return c.json(result, 200);
  } catch (err) {
    if (c.env?.ALERT_WEBHOOK_URL) {
      // ... 기존 sendAlert 로직 동일 유지 ...
    }
    return c.json({ error: String(err) }, 500);
  }
});
```

#### 6. `/health` 라우트 정의 및 등록

```typescript
const healthRoute = createRoute({
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

// /health 는 캐싱 없음 — app.use() 없이 바로 app.openapi()
app.openapi(healthRoute, async (c) => {
  const status = await runHealthCheck();
  return c.json(status, status.ok ? 200 : 503);
});
```

#### 7. exports 유지 (변경 없음)

```typescript
export { app };

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext): Promise<void> {
    // ... 기존 로직 동일 ...
  },
};
```

**검증:**
```bash
pnpm --filter ollama-models-api test
```
모든 기존 테스트가 통과해야 한다. `app.request()` 는 `OpenAPIHono extends Hono` 이므로
그대로 동작한다.
</action>

<acceptance_criteria>
- [ ] `grep -q "OpenAPIHono" api/src/index.ts`
- [ ] `grep -q "from '@hono/zod-openapi'" api/src/index.ts`
- [ ] `grep -q "createRoute" api/src/index.ts`
- [ ] `grep -q "from './schemas'" api/src/index.ts`
- [ ] `grep -q "app.openapi(" api/src/index.ts`
- [ ] `grep -q "app.use(" api/src/index.ts` (withCache 미들웨어 등록)
- [ ] `grep -qv "new Hono<" api/src/index.ts` (기존 Hono 인스턴스화 없음)
- [ ] `grep -qv "withCache(SEARCH_TTL, " api/src/index.ts` (기존 2-arg withCache 패턴 없음)
- [ ] `grep -q "MiddlewareHandler" api/src/index.ts`
- [ ] `grep -q "c.json(result, 200)" api/src/index.ts` (상태 코드 명시)
- [ ] `pnpm --filter ollama-models-api test` 가 0 exit code로 종료
- [ ] `pnpm --filter ollama-models-api type-check` 가 0 exit code로 종료
</acceptance_criteria>

## Verification

```bash
# 테스트 전체 통과 확인
pnpm --filter ollama-models-api test

# TypeScript 타입 검사
pnpm --filter ollama-models-api type-check

# app export 확인
grep "^export" api/src/index.ts
# 기대값:
# export { app };
# export default { ... }
```

## Threat Model

### Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HTTP query → Zod 검증 → route handler | 사용자 쿼리 파라미터가 createRoute query 스키마를 통과한다 |
| route handler → scraper | 핸들러가 파싱된 값을 스크래퍼에 전달한다 |

### STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-2-01 | Spoofing | GET /search?page= 파라미터 | mitigate | Zod 가 쿼리 파라미터를 string 으로 수신 후 핸들러에서 `parseInt` + `Math.max(1, ...)` 로 클램핑 — 음수·문자 입력 모두 1로 처리됨 |
| T-2-02 | Spoofing | GET /model?name= 파라미터 | mitigate | 핸들러에서 `!name.trim()` 검사(400) + URL 정규식 정규화 + `path.includes('/')` 검사(400) — 경로 탈출 불가 |
| T-2-03 | Denial of Service | scraper fetch 무제한 요청 | accept | Cloudflare Workers 의 CPU time limit 가 자연스러운 방어선. 이 phase 에서 rate limiting 범위 외 |
| T-2-04 | Information Disclosure | 500 에러에 scraper 에러 메시지 포함 | accept | 에러 메시지에는 CSS 선택자·URL 등 내부 구현 세부사항이 포함되나, 이는 운영 진단 목적으로 의도된 것 |
