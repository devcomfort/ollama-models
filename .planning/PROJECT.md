# ollama-models

## What This Is

`ollama-models`는 공식 API가 없는 `ollama.com`을 스크래핑하여 모델 검색 및 태그 목록 조회 기능을 JSON HTTP API로 제공하는 Cloudflare Workers 백엔드와, 이를 감싸는 TypeScript·Python 클라이언트 SDK 모노레포다. 개발자가 Ollama 모델 레지스트리 데이터를 프로그래매틱하게 조회할 수 있게 한다.

## Core Value

OpenAPI 명세로 정의된 단일 계약(contract)이 API 구현·TS 클라이언트·Python 클라이언트를 모두 묶어, 스크래퍼 변경이나 응답 스키마 변경 시 CI에서 자동으로 불일치를 감지할 수 있어야 한다.

## Requirements

### Validated

- ✓ `GET /search?q={keyword}&page={n}` — Ollama 검색 결과 스크래핑 — existing
- ✓ `GET /model?name={model}` — 모델 태그 목록 스크래핑 — existing
- ✓ `GET /health` — 스크래퍼 생존 확인 + Slack/Discord 웹훅 알림 — existing
- ✓ 매시간 cron 헬스체크 (wrangler.toml) — existing
- ✓ Cloudflare Cache API를 통한 응답 캐싱 (search 60s, model 300s) — existing
- ✓ TypeScript 클라이언트 (`@devcomfort/ollama-models`) — existing
- ✓ Python 클라이언트 (`ollama-models`) — existing
- ✓ API 경보 시 알림 웹훅 (ALERT_WEBHOOK_URL) — existing

### Active

- [ ] 빌드 시 OpenAPI 3.x 명세 자동 생성 (코드 우선: Zod 스키마 + Hono OpenAPI annotation)
- [ ] TS 클라이언트가 생성된 OpenAPI spec과 일치하는지 CI에서 검증
- [ ] Python 클라이언트가 생성된 OpenAPI spec과 일치하는지 CI에서 검증
- [ ] GitHub Actions CI/CD 파이프라인 (`wrangler dev` 로컬 실행 후 클라이언트 통합 테스트)

### Out of Scope

- 클라이언트 코드 자동 생성 (openapi-generator) — 기존 수동 유지 코드 보존, 검증만으로 충분
- ollama.com 외 다른 레지스트리 지원 — 현재 프로젝트 범위 초과
- 인증·결제·사용자 관리 — 공개 API, 불필요

## Context

- `ollama.com`에 공식 API가 없어 CSS 셀렉터 기반 스크래핑에 의존 → 프론트엔드 변경 시 선택자가 깨질 위험이 상존
- 현재 타입 정의가 세 군데(`api/src/`, `packages/ts-client/src/`, `packages/py-client/src/`)에 수동 동기화 상태로 존재 — 단일 계약 없음
- Hono 라우터는 `@hono/zod-openapi` 미들웨어로 코드 우선 OpenAPI 생성 지원
- Cloudflare Workers 환경: `wrangler dev`로 로컬 실행 가능 → CI에서 서버 띄우기 가능
- Python 클라이언트는 rye로 관리되며 pnpm 워크스페이스에 포함되지 않음
- 기존 수동 테스트(Vitest + pytest)는 목(mock)을 사용 → 실제 서버와의 통합 테스트 없음

## Constraints

- **Tech Stack**: Cloudflare Workers + Hono — OpenAPI 솔루션은 Workers 런타임과 호환돼야 함
- **Compatibility**: Python 3.8+ 지원 유지
- **Compatibility**: 기존 `@devcomfort/ollama-models` NPM 패키지 공개 API 하위 호환
- **Dependency**: `ollama.com` HTML 구조 변경 시 스크래퍼 선택자 수동 업데이트 필요
- **Security**: `wrangler.toml`에 노출된 `account_id` — CI 시크릿으로 이동 고려

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 코드 우선 OpenAPI (Zod + Hono) | 기존 타입과 가장 가깝고, Workers 런타임에서 실행 가능 | — Pending |
| 클라이언트 코드 생성 대신 검증만 | 기존 수동 코드 보존, 생성 툴 의존성 없이 계약 안전망 확보 | — Pending |
| GitHub Actions + wrangler dev | 실제 Workers 런타임 환경에서 통합 테스트, 별도 인프라 불필요 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-05 after initialization*
