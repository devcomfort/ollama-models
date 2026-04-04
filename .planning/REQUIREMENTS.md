# Requirements: ollama-models

**Defined:** 2026-04-05
**Core Value:** OpenAPI 명세로 정의된 단일 계약(contract)이 API 구현·TS 클라이언트·Python 클라이언트를 모두 묶어, 스크래퍼 변경이나 응답 스키마 변경 시 CI에서 자동으로 불일치를 감지할 수 있어야 한다.

## v1 Requirements

### OpenAPI: Spec Generation

- [ ] **OPENAPI-01**: `api/src/` 의 모든 응답 타입이 Zod 스키마(`api/src/schemas.ts`)로 정의된다
- [ ] **OPENAPI-02**: Hono 앱이 `OpenAPIHono`로 마이그레이션되고, 모든 라우트(`/search`, `/model`, `/health`)가 `createRoute()`로 등록된다
- [ ] **OPENAPI-03**: `api/scripts/generate-openapi.ts` 실행 시 `api/openapi.json`이 생성된다 (OpenAPI 3.x)
- [ ] **OPENAPI-04**: `pnpm build:spec` (또는 해당 스크립트)으로 빌드 시간에 `openapi.json`을 재생성할 수 있다
- [ ] **OPENAPI-05**: 생성된 `openapi.json`이 레포에 커밋되어 CI에서 drift를 감지할 수 있다

### CLIENT: TypeScript Client Validation

- [ ] **CLIENT-01**: `packages/ts-client/scripts/validate-schema.ts`가 생성된 `openapi.json`과 TS 클라이언트 타입을 비교 검증한다
- [ ] **CLIENT-02**: TS 클라이언트의 모든 응답 타입 필드(이름, 타입, nullable 여부)가 spec과 일치해야 검증을 통과한다
- [ ] **CLIENT-03**: 불일치 발견 시 명확한 에러 메시지와 함께 non-zero exit code로 종료한다
- [ ] **CLIENT-04**: `pnpm validate:schema`로 검증 스크립트를 실행할 수 있다

### CLIENT: Python Client Validation

- [ ] **CLIENT-05**: `packages/py-client/scripts/validate_schema.py`가 생성된 `openapi.json`과 Python 클라이언트 dataclass를 비교 검증한다
- [ ] **CLIENT-06**: Python 클라이언트의 모든 dataclass 필드(이름, Optional 여부)가 spec과 일치해야 검증을 통과한다
- [ ] **CLIENT-07**: 불일치 발견 시 명확한 에러 메시지와 함께 non-zero exit code로 종료한다
- [ ] **CLIENT-08**: Python 3.8+ 환경에서 외부 의존성 없이 (`jsonschema` 제외) 실행 가능하다

### CI: GitHub Actions Pipeline

- [ ] **CI-01**: GitHub Actions 워크플로우(`.github/workflows/ci.yml`)가 push/PR 시 자동으로 실행된다
- [ ] **CI-02**: CI는 `wrangler dev --local`로 로컬 Worker를 실행하고, 서버가 준비될 때까지 대기한다
- [ ] **CI-03**: CI는 로컬 서버 대상으로 `packages/ts-client` 통합 테스트를 실행한다
- [ ] **CI-04**: CI는 로컬 서버 대상으로 `packages/py-client` 통합 테스트를 실행한다
- [ ] **CI-05**: CI는 TS 클라이언트 schema 검증(`CLIENT-01~04`)을 실행한다
- [ ] **CI-06**: CI는 Python 클라이언트 schema 검증(`CLIENT-05~08`)을 실행한다
- [ ] **CI-07**: CI는 `openapi.json` drift 감지(재생성 후 변경 사항 없음 확인)를 실행한다
- [ ] **CI-08**: `wrangler.toml`의 `account_id`가 CI 시크릿 또는 `--local` 플래그로 처리되어 Cloudflare 인증 없이 동작한다

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Documentation

- **DOCS-01**: 생성된 `openapi.json`에서 Swagger UI(`/docs`) 제공 — API 탐색 편의성
- **DOCS-02**: 클라이언트 패키지 README에 OpenAPI spec 링크 및 type 동기화 방법 안내

### DX

- **DX-01**: `openapi.json` 변경 시 TS/Python 클라이언트 타입을 자동 업데이트하는 코드 생성 스크립트 — 현재는 검증만으로 충분

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| openapi-generator를 사용한 자동 클라이언트 코드 생성 | 기존 수동 유지 코드의 하위 호환성 보존, 검증만으로 계약 안전망 확보 |
| ollama.com 외 다른 모델 레지스트리 지원 | 현재 프로젝트 범위를 벗어남 |
| OpenAPI spec 기반 Mock 서버 생성 | 기존 Vitest mock으로 충분 |
| GraphQL 또는 gRPC API 변환 | 불필요, REST JSON으로 충분 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| OPENAPI-01 | — | Pending |
| OPENAPI-02 | — | Pending |
| OPENAPI-03 | — | Pending |
| OPENAPI-04 | — | Pending |
| OPENAPI-05 | — | Pending |
| CLIENT-01 | — | Pending |
| CLIENT-02 | — | Pending |
| CLIENT-03 | — | Pending |
| CLIENT-04 | — | Pending |
| CLIENT-05 | — | Pending |
| CLIENT-06 | — | Pending |
| CLIENT-07 | — | Pending |
| CLIENT-08 | — | Pending |
| CI-01 | — | Pending |
| CI-02 | — | Pending |
| CI-03 | — | Pending |
| CI-04 | — | Pending |
| CI-05 | — | Pending |
| CI-06 | — | Pending |
| CI-07 | — | Pending |
| CI-08 | — | Pending |
