# SUMMARY.md — 리서치 요약

## 핵심 발견

**스택:**
- `@hono/zod-openapi ^0.19.x` — Cloudflare Workers 공식 지원, `new Hono()` → `new OpenAPIHono()` 마이그레이션으로 OpenAPI 3.0/3.1 spec 자동 생성 가능
- `tsx` — 빌드 스크립트(`generate-openapi.ts`) 실행용 타입스크립트 런너
- `wrangler dev --local` — GitHub Actions에서 Cloudflare 계정 없이 로컬 Worker 실행 가능 (Miniflare 기반)

**테이블 스테이크:**
1. `app.getOpenAPIDocument()` → `api/openapi.json` 빌드 시 생성
2. TS/Python 클라이언트 검증 스크립트 (spec 필드 vs 클라이언트 타입 비교)
3. GitHub Actions 워크플로우 (단위 테스트 + 스키마 검증 + 통합 테스트)

**주의사항:**
- `withCache()` HOF 타입 호환성 확인 필요 (OpenAPIHono 핸들러 타입과 충돌 가능)
- `wrangler dev` 서버 준비 대기 로직 필수 (`wait-on` 또는 `curl --retry`)
- `default_tag: string | null` → `.nullable()` 사용, `.optional()` 아님
- 통합 테스트는 스키마 형식만 검증 (실제 ollama.com 의존 최소화)
- `wrangler.toml`의 `account_id` → CI 환경에서는 `--local` 플래그로 우회

## 권장 빌드 순서

```
페이즈 1: API OpenAPIHono 마이그레이션 + openapi.json 생성
  └── 기존 단위 테스트 통과 유지 필수

페이즈 2: 클라이언트 스키마 검증 스크립트 + 통합 테스트
  └── TS client validate + Python client validate

페이즈 3: GitHub Actions CI/CD 파이프라인
  └── wrangler dev → wait → test:integration → validate:schema
```

## 위험 평가

| 항목 | 위험도 | 이유 |
|---|---|---|
| OpenAPIHono 마이그레이션 | 낮음 | Hono API 거의 동일, 기존 타입→Zod 변환 기계적 |
| withCache HOF 호환성 | 중간 | TypeScript 타입 조정 필요할 수 있음 |
| wrangler dev CI 설정 | 낮음 | --local 플래그로 인증 우회, wait-on으로 준비 대기 |
| 통합 테스트 안정성 | 중간 | 실제 ollama.com 의존도 → 안정적 모델명 고정으로 완화 |
