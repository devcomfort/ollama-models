# Roadmap: ollama-models

**Milestone:** v1 — OpenAPI Contract & CI Validation
**Created:** 2026-04-05
**Config:** Coarse granularity | YOLO mode

## Phases

- [ ] **Phase 1: OpenAPI Foundation** — Zod 스키마 정의, OpenAPIHono 마이그레이션, spec 생성 스크립트 및 커밋
- [ ] **Phase 2: Client Schema Validation** — TS·Python 클라이언트 검증 스크립트 구축
- [ ] **Phase 3: CI/CD Pipeline** — GitHub Actions 워크플로우로 빌드·검증·통합 테스트 자동화

## Phase Details

### Phase 1: OpenAPI Foundation
**Goal:** API가 OpenAPI 3.x spec을 빌드 시점에 자동 생성하고 레포에 커밋된 상태로 유지한다
**Requires:** OPENAPI-01, OPENAPI-02, OPENAPI-03, OPENAPI-04, OPENAPI-05
**Depends on:** none
**Estimate:** M

**Success Criteria** (what must be TRUE):
1. `pnpm build:spec` 실행 시 `api/openapi.json`이 생성된다
2. `/search`, `/model`, `/health` 세 엔드포인트가 모두 spec에 정의된다
3. 기존 단위 테스트가 OpenAPIHono 마이그레이션 후에도 통과한다
4. `openapi.json`이 레포에 커밋되어 버전 관리된다

**Plans:** 3 plans

Plans:
- [ ] 01-PLAN-zod-schemas.md — Zod 스키마 7개 정의 (api/src/schemas.ts)
- [ ] 01-PLAN-openapihono-migration.md — dep 설치 + OpenAPIHono 마이그레이션
- [ ] 01-PLAN-spec-generation.md — build:spec 스크립트 + openapi.json 커밋

### Phase 2: Client Schema Validation
**Goal:** TS·Python 클라이언트 타입이 OpenAPI spec과 일치하는지 커맨드 하나로 검증할 수 있다
**Requires:** CLIENT-01, CLIENT-02, CLIENT-03, CLIENT-04, CLIENT-05, CLIENT-06, CLIENT-07, CLIENT-08
**Depends on:** Phase 1 (OpenAPI Foundation)
**Estimate:** M

**Success Criteria** (what must be TRUE):
1. `pnpm validate:schema`로 TS 클라이언트 타입이 spec과 일치하는지 확인된다
2. Python 검증 스크립트(`validate_schema.py`)가 Python 3.8+ 환경에서 외부 의존성 없이 실행된다
3. 타입 불일치 시 불일치 필드와 함께 명확한 에러 메시지를 출력하고 non-zero exit code로 종료한다

**Plans:** TBD

### Phase 3: CI/CD Pipeline
**Goal:** push·PR 시 GitHub Actions가 spec drift 감지·스키마 검증·통합 테스트를 자동으로 실행한다
**Requires:** CI-01, CI-02, CI-03, CI-04, CI-05, CI-06, CI-07, CI-08
**Depends on:** Phase 2 (Client Schema Validation)
**Estimate:** M

**Success Criteria** (what must be TRUE):
1. push 또는 PR 시 `.github/workflows/ci.yml`이 자동 실행된다
2. CI 내에서 `wrangler dev --local`로 서버 실행 후 TS·Python 통합 테스트가 통과한다
3. TS·Python 스키마 검증 단계가 CI에서 모두 통과한다
4. `openapi.json` 재생성 결과가 커밋된 파일과 다를 경우 drift 단계에서 CI가 실패한다
5. Cloudflare 계정 인증 없이 CI 전체 파이프라인이 성공적으로 실행된다

**Plans:** TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. OpenAPI Foundation | 0/3 | Not started | - |
| 2. Client Schema Validation | 0/? | Not started | - |
| 3. CI/CD Pipeline | 0/? | Not started | - |

## Milestone Definition of Done

- [ ] All 21 v1 requirements implemented and verified
- [ ] `api/openapi.json` committed and up to date with implementation
- [ ] `pnpm validate:schema` passes (TS client)
- [ ] Python schema validation script passes
- [ ] GitHub Actions CI passes on push (no Cloudflare auth required)
- [ ] Integration tests pass against `wrangler dev --local`
