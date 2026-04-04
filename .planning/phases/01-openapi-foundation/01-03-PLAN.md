---
phase: 1
name: "Spec Generation"
wave: 3
depends_on: [01-PLAN-openapihono-migration]
requirements: [OPENAPI-03, OPENAPI-04, OPENAPI-05]
files_modified:
  - api/scripts/generate-openapi.ts
  - api/package.json
  - api/openapi.json
autonomous: true

must_haves:
  truths:
    - "pnpm build:spec 실행 시 api/openapi.json 이 생성된다"
    - "/search, /model, /health 세 경로가 openapi.json 의 paths 에 정의된다"
    - "openapi.json 이 유효한 OpenAPI 3.0 JSON 이다"
    - "openapi.json 이 레포에 커밋되어 git ls-files 로 추적된다"
  artifacts:
    - path: "api/scripts/generate-openapi.ts"
      provides: "build-time spec 생성 스크립트"
      contains: "getOpenAPIDocument"
    - path: "api/package.json"
      provides: "build:spec 스크립트"
      contains: "build:spec"
    - path: "api/openapi.json"
      provides: "OpenAPI 3.0 spec"
      contains: '"/search"'
  key_links:
    - from: "api/scripts/generate-openapi.ts"
      to: "api/src/index.ts"
      via: "named import of app"
      pattern: "from '../src/index'"
    - from: "api/scripts/generate-openapi.ts"
      to: "api/openapi.json"
      via: "writeFileSync 호출"
      pattern: "writeFileSync"
    - from: "api/package.json build:spec"
      to: "api/scripts/generate-openapi.ts"
      via: "tsx CLI"
      pattern: "tsx scripts/generate-openapi"
---

# Plan: Spec Generation

## Goal
`api/scripts/generate-openapi.ts` 를 생성하고, `api/package.json` 에 `build:spec` 스크립트를
추가한다. `pnpm --filter ollama-models-api build:spec` 실행 시 `api/openapi.json` 이 생성되고,
해당 파일을 레포에 커밋하여 Phase 3 CI drift 감지의 기준 파일이 된다.

`api/tsconfig.json` 의 `include` 범위는 **변경하지 않는다** — `scripts/` 는 Worker 번들과
분리되어야 하며, `tsx` 가 TypeScript 를 직접 실행하므로 `tsc` 경로 불필요.

## Tasks

### Task 1: Create Script and Add `build:spec`

<read_first>
- api/src/index.ts — app export 위치 확인 (`export { app }` 라인)
- api/package.json — 현재 scripts 섹션 확인 (기존 build:spec 없음)
- api/tsconfig.json — include 범위 확인 (src/**/*.ts 만 포함)
</read_first>

<action>
#### 1. `api/scripts/generate-openapi.ts` 생성

디렉터리 `api/scripts/` 는 없으면 생성한다.

```typescript
/**
 * Build-time script: generates api/openapi.json from the OpenAPIHono app registry.
 *
 * Run via: pnpm --filter ollama-models-api build:spec
 *
 * This script imports `app` from src/index.ts and calls the in-memory
 * `app.getOpenAPIDocument()` method — no HTTP server is started.
 * The `caches.default` global (Cloudflare Workers) is only accessed at request
 * time inside withCache middleware, so importing `app` here is safe in Node.js.
 *
 * @example
 * ```bash
 * tsx scripts/generate-openapi.ts
 * ```
 */
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
    description:
      'Cloudflare Workers API that scrapes ollama.com to search models and list tags.',
  },
  servers: [
    {
      url: 'https://ollama-models-api.devcomfort.workers.dev',
      description: 'Production',
    },
  ],
});

const outputPath = resolve(__dirname, '../openapi.json');
writeFileSync(outputPath, JSON.stringify(spec, null, 2) + '\n');
console.log(`Generated: ${outputPath}`);
```

**주의:** `node:fs`, `node:path`, `node:url` prefix 사용 — wrangler 가 Worker 번들에
이 스크립트를 포함시킬 경우를 대비한 안전장치. (`tsconfig.json` include 가 `src/**` 이므로
실제로는 포함되지 않지만, 명시적 `node:` prefix 가 의도를 명확히 함.)

#### 2. `api/package.json` 에 `build:spec` 스크립트 추가

기존 `scripts` 섹션에 한 줄만 추가한다:

```json
"build:spec": "tsx scripts/generate-openapi.ts"
```

최종 scripts 섹션 예시:
```json
"scripts": {
  "dev": "wrangler dev",
  "deploy": "wrangler deploy",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "build:spec": "tsx scripts/generate-openapi.ts"
}
```
</action>

<acceptance_criteria>
- [ ] `test -f api/scripts/generate-openapi.ts`
- [ ] `grep -q "from '../src/index'" api/scripts/generate-openapi.ts`
- [ ] `grep -q "app.getOpenAPIDocument" api/scripts/generate-openapi.ts`
- [ ] `grep -q "writeFileSync" api/scripts/generate-openapi.ts`
- [ ] `grep -q "openapi.json" api/scripts/generate-openapi.ts`
- [ ] `grep -q "node:fs" api/scripts/generate-openapi.ts`
- [ ] `grep -q "build:spec" api/package.json`
- [ ] `grep -q "tsx scripts/generate-openapi" api/package.json`
</acceptance_criteria>

---

### Task 2: Run `build:spec`, Verify Output, and Commit

<read_first>
- api/scripts/generate-openapi.ts — Task 1 결과물 (실행 대상)
- api/src/index.ts — app 이 올바르게 export 되는지 확인
</read_first>

<action>
#### 1. spec 생성 실행

```bash
cd /home/devcomfort/ollama-models
pnpm --filter ollama-models-api build:spec
```

성공 시 `Generated: .../api/openapi.json` 출력.

#### 2. 출력 파일 검증

```bash
# 유효한 JSON 확인
python3 -m json.tool api/openapi.json > /dev/null && echo "Valid JSON"

# 세 엔드포인트 존재 확인
grep '"/search"' api/openapi.json
grep '"/model"' api/openapi.json
grep '"/health"' api/openapi.json

# openapi 버전 필드 확인
grep '"openapi"' api/openapi.json
# 기대값: "openapi": "3.0.0"

# 스키마 컴포넌트 확인
grep '"SearchResult"' api/openapi.json
grep '"ModelTags"' api/openapi.json
grep '"HealthStatus"' api/openapi.json
```

#### 3. openapi.json 을 레포에 커밋

```bash
cd /home/devcomfort/ollama-models
git add api/openapi.json
git status  # Staged 확인

git commit -m "feat(api): add generated openapi.json (Phase 1 OPENAPI-05)"
```

커밋 메시지에 `OPENAPI-05` 포함 — CI drift 감지의 기준 커밋임을 나타냄.

#### 4. 기존 테스트 재확인

```bash
pnpm --filter ollama-models-api test
```

openapi.json 생성 과정이 테스트에 영향 없어야 한다.

#### 5. Phase 성공 기준 최종 체크

```bash
# 1. build:spec 스크립트 실행 가능
pnpm --filter ollama-models-api build:spec

# 2. 세 엔드포인트 spec 정의 확인
python3 -c "
import json
spec = json.load(open('api/openapi.json'))
paths = spec.get('paths', {})
required = ['/search', '/model', '/health']
missing = [p for p in required if p not in paths]
if missing:
    raise SystemExit(f'Missing paths: {missing}')
print('All 3 endpoints present:', list(paths.keys()))
"

# 3. git 추적 확인
git ls-files api/openapi.json
# 기대값: api/openapi.json (빈 출력이면 커밋 안 됨)
```
</action>

<acceptance_criteria>
- [ ] `test -f api/openapi.json`
- [ ] `python3 -m json.tool api/openapi.json > /dev/null` (유효한 JSON)
- [ ] `grep -q '"/search"' api/openapi.json`
- [ ] `grep -q '"/model"' api/openapi.json`
- [ ] `grep -q '"/health"' api/openapi.json`
- [ ] `grep -q '"openapi": "3.0.0"' api/openapi.json`
- [ ] `grep -q '"SearchResult"' api/openapi.json`
- [ ] `grep -q '"ModelTags"' api/openapi.json`
- [ ] `grep -q '"HealthStatus"' api/openapi.json`
- [ ] `git ls-files api/openapi.json | grep -q openapi.json` (git 추적 중)
- [ ] `pnpm --filter ollama-models-api test` 가 0 exit code로 종료 (기존 테스트 통과)
</acceptance_criteria>

## Verification

```bash
# 종합 검증 (Phase 성공 기준 4개 항목)

# 1. pnpm build:spec 실행 → openapi.json 생성
pnpm --filter ollama-models-api build:spec
echo "Exit code: $?"  # 기대값: 0

# 2. 세 엔드포인트 모두 spec 에 정의됨
python3 -c "
import json, sys
spec = json.load(open('api/openapi.json'))
paths = spec.get('paths', {})
for p in ['/search', '/model', '/health']:
    assert p in paths, f'Missing: {p}'
print('OK: all 3 endpoints in spec')
"

# 3. 기존 단위 테스트 모두 통과
pnpm --filter ollama-models-api test

# 4. openapi.json 이 git 에서 추적됨
git ls-files api/openapi.json
git log --oneline -1 -- api/openapi.json
```

## Threat Model

### Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 빌드 스크립트 → 파일시스템 | generate-openapi.ts 가 openapi.json 을 디스크에 기록한다 |
| openapi.json → CI (Phase 3) | 커밋된 spec 이 drift 감지의 기준 파일이 된다 |

### STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-3-01 | Information Disclosure | api/openapi.json 공개 커밋 | accept | 이 API 의 의도된 목적: spec 을 계약으로 공개. 민감 정보(시크릿, 내부 IP) 없음 |
| T-3-02 | Tampering | openapi.json 수동 편집 | mitigate | Phase 3 CI 에서 `pnpm build:spec && git diff --exit-code api/openapi.json` drift 감지로 탐지 |
| T-3-03 | Repudiation | scripts/ 가 Worker 번들에 포함 | mitigate | tsconfig.json `include: ["src/**/*.ts"]` 로 scripts/ 제외. `node:fs` import prefix 도 방어 계층 |
| T-3-04 | Denial of Service | generate script 실행 시 네트워크 호출 | accept | `app.getOpenAPIDocument()` 는 순수 in-memory 연산 — 네트워크 호출 없음 |
