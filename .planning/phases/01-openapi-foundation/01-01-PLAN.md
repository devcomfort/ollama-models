---
phase: 1
name: "Zod Schemas"
wave: 1
depends_on: []
requirements: [OPENAPI-01]
files_modified:
  - api/src/schemas.ts
autonomous: true

must_haves:
  truths:
    - "api/src/schemas.ts 가 존재하고 @hono/zod-openapi 의 z 를 import 한다"
    - "SearchResult, ModelTags, HealthStatus 세 핵심 응답 타입이 Zod 스키마로 표현된다"
    - "모든 스키마가 named export 로 공개된다"
  artifacts:
    - path: "api/src/schemas.ts"
      provides: "OpenAPI-annotated Zod 스키마 7개"
      exports:
        - ModelPageSchema
        - PageRangeSchema
        - SearchResultSchema
        - ModelTagsSchema
        - CheckResultSchema
        - HealthStatusSchema
        - ErrorSchema
  key_links:
    - from: "api/src/schemas.ts"
      to: "api/src/index.ts (Plan 02)"
      via: "named import"
      pattern: "from './schemas'"
---

# Plan: Zod Schemas

## Goal
`api/src/` 의 모든 HTTP 응답 타입을 `api/src/schemas.ts` 에 Zod 스키마로 정의한다.
이 파일이 이후 OpenAPIHono 라우트 정의와 build-time spec 생성의 단일 소스가 된다.

기존 `search/types.ts`, `model/types.ts` 의 TypeScript 인터페이스는 **변경하지 않는다** —
scraper 내부에서 사용 중이며, 스키마 파일은 별도 레이어다.

## Tasks

### Task 1: Create `api/src/schemas.ts`

<read_first>
- api/src/search/types.ts — PageRange, ModelPage, SearchResult 인터페이스 구조 확인
- api/src/model/types.ts — ModelTags, default_tag nullable 필드 확인
- api/src/index.ts — CheckResult, HealthStatus 내부 인터페이스 확인 (index 최상단)
</read_first>

<action>
`api/src/schemas.ts` 를 아래 내용으로 새로 생성한다. 기존 파일 없음 — 순수 신규 생성.

```typescript
// ─── Zod schemas for OpenAPI spec generation ──────────────────────────────────
// z must be imported from @hono/zod-openapi (NOT from 'zod').
// @hono/zod-openapi calls extendZodWithOpenApi(z) internally,
// which adds the .openapi() method to every Zod type.
import { z } from '@hono/zod-openapi';

// ─── ModelPage ────────────────────────────────────────────────────────────────

/**
 * A single Ollama model page entry returned inside a search result.
 * Mirrors {@link import('./search/types').ModelPage}.
 */
export const ModelPageSchema = z
  .object({
    http_url: z
      .string()
      .openapi({ example: 'https://ollama.com/library/qwen3' }),
    model_id: z
      .string()
      .openapi({ example: 'library/qwen3' }),
  })
  .openapi('ModelPage');

// ─── PageRange ────────────────────────────────────────────────────────────────

/**
 * The page or range of pages that was requested.
 *
 * The runtime API always returns a single integer (the requested page number).
 * Simplified to z.number() here for a clean OpenAPI schema; the TypeScript type
 * in search/types.ts retains the full `number | { from, to }` union.
 */
export const PageRangeSchema = z
  .number()
  .int()
  .min(1)
  .openapi({ example: 1, description: 'Requested page number (1-based)' });

// ─── SearchResult ─────────────────────────────────────────────────────────────

/**
 * Response payload of GET /search.
 * Mirrors {@link import('./search/types').SearchResult}.
 */
export const SearchResultSchema = z
  .object({
    pages: z
      .array(ModelPageSchema)
      .openapi({ description: 'Model pages found on the requested search page' }),
    page_range: PageRangeSchema,
    keyword: z
      .string()
      .openapi({ example: 'qwen3', description: 'Search keyword used for the request' }),
  })
  .openapi('SearchResult');

// ─── ModelTags ────────────────────────────────────────────────────────────────

/**
 * Response payload of GET /model.
 * Mirrors {@link import('./model/types').ModelTags}.
 *
 * `default_tag` is nullable — null when the model has no `latest` tag.
 */
export const ModelTagsSchema = z
  .object({
    page_url: z
      .string()
      .openapi({ example: 'https://ollama.com/library/qwen3' }),
    id: z
      .string()
      .openapi({ example: 'library/qwen3' }),
    tags: z
      .array(z.string())
      .openapi({ example: ['qwen3:latest', 'qwen3:4b', 'qwen3:8b'] }),
    default_tag: z
      .string()
      .nullable()
      .openapi({
        example: 'qwen3:latest',
        description: 'Pull-ready tag whose label is "latest". null when no latest tag exists.',
      }),
  })
  .openapi('ModelTags');

// ─── Health check schemas ─────────────────────────────────────────────────────

/**
 * Result of a single scraper probe. Used inside HealthStatus.checks.
 */
export const CheckResultSchema = z
  .object({
    ok: z.boolean().openapi({ example: true }),
    count: z
      .number()
      .int()
      .optional()
      .openapi({ example: 5, description: 'Number of results returned when check passed' }),
    error: z
      .string()
      .optional()
      .openapi({ example: 'Error: selector returned 0 results' }),
  })
  .openapi('CheckResult');

/**
 * Response payload of GET /health.
 * Mirrors the HealthStatus interface in api/src/index.ts.
 */
export const HealthStatusSchema = z
  .object({
    ok: z.boolean().openapi({ example: true }),
    timestamp: z
      .string()
      .openapi({ example: '2026-01-01T00:00:00.000Z', description: 'ISO 8601 timestamp' }),
    checks: z
      .object({
        search: CheckResultSchema,
        model: CheckResultSchema,
      })
      .openapi({ description: 'Per-scraper probe results' }),
  })
  .openapi('HealthStatus');

// ─── Error response ───────────────────────────────────────────────────────────

/**
 * Generic error response shape returned on 4xx / 5xx.
 */
export const ErrorSchema = z
  .object({
    error: z
      .string()
      .openapi({ example: 'Error: selector returned 0 results' }),
  })
  .openapi('ApiError');
```

**주의사항:**
- `import { z } from 'zod'` 금지 — `.openapi()` 메서드가 없어 TypeScript 에러 발생
- `PageRangeSchema` 는 `z.number().int().min(1)` 으로 단순화 (API 실제 반환값은 항상 단일 정수)
- `default_tag: z.string().nullable()` → OpenAPI 3.0 의 `{ type: 'string', nullable: true }` 로 변환됨
- `@hono/zod-openapi` 는 아직 `package.json` 에 없으므로 Plan 02 가 dep 설치 후 TypeScript 검증이 완성됨
</action>

<acceptance_criteria>
- [ ] `test -f api/src/schemas.ts`
- [ ] `grep -q "from '@hono/zod-openapi'" api/src/schemas.ts`
- [ ] `grep -q "export const ModelPageSchema" api/src/schemas.ts`
- [ ] `grep -q "export const SearchResultSchema" api/src/schemas.ts`
- [ ] `grep -q "export const ModelTagsSchema" api/src/schemas.ts`
- [ ] `grep -q "export const CheckResultSchema" api/src/schemas.ts`
- [ ] `grep -q "export const HealthStatusSchema" api/src/schemas.ts`
- [ ] `grep -q "export const ErrorSchema" api/src/schemas.ts`
- [ ] `grep -q "export const PageRangeSchema" api/src/schemas.ts`
- [ ] `grep -q "\.nullable()" api/src/schemas.ts` (default_tag nullable 확인)
- [ ] `grep -q "\.openapi(" api/src/schemas.ts` (OpenAPI annotation 존재)
- [ ] `grep -qv "from 'zod'" api/src/schemas.ts` (direct zod import 없음)
</acceptance_criteria>

## Verification

Plan 02 설치 전이므로 TypeScript 컴파일은 아직 통과하지 않는다 — 그것은 의도된 상태.
현 단계 검증은 파일 존재와 문법 구조 확인으로 충분:

```bash
# 파일 존재 확인
ls -la api/src/schemas.ts

# import 소스 확인 (zod 직접 import 없음)
grep "from 'zod'" api/src/schemas.ts && echo "ERROR: direct zod import found" || echo "OK"

# 7개 named export 확인
grep "^export const" api/src/schemas.ts | wc -l
# 기대값: 7
```

## Threat Model

### Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 없음 | 이 플랜은 빌드 시점 타입 정의 파일만 생성한다. 사용자 입력을 처리하지 않는다. |

### STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-1-01 | Information Disclosure | schemas.ts → openapi.json (Phase 3) | accept | API 스펙 공개는 이 프로젝트의 의도된 목적 (public API) |
| T-1-02 | Tampering | PageRangeSchema 단순화 (number만) | accept | 실제 API 응답은 항상 단일 정수를 반환하므로 스키마 단순화는 정확한 계약을 표현함 |
