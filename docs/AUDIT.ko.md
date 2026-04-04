# 모니터링, 알림 & 스키마 검증

## 개요
이 문서는 API의 신뢰성과 일관성을 보장하는 두 가지 자동화 시스템을 설명합니다.

1. **스크래퍼 무결성 모니터링 (Scraper Integrity Monitoring)**: Ollama의 HTML 구조 변경으로 인한 장애를 감지하고 알림을 전송합니다.
2. **스키마 검증 파이프라인 (Schema Validation Pipeline)**: API, TypeScript 클라이언트, Python 클라이언트 간의 스키마 동기화를 보장합니다.

---

## 1. 스크래퍼 무결성 모니터링

API는 Ollama의 HTML 구조 변경으로 인한 스크래퍼 장애를 감지하고, 사용자가 문제를 체감하기 전에 웹훅으로 알림을 전송하도록 설계되었습니다.

### 사전 요구 사항
- Slack 호환 웹훅 URL.
- `wrangler` CLI 설치 및 설정.

### 스케줄 헬스 체크
`api/wrangler.toml`에 매 시 정각에 실행되는 Cloudflare Cron Trigger가 등록되어 있습니다.

```toml
[triggers]
crons = ["0 * * * *"]
```

`api/src/index.ts`의 `scheduled` 핸들러가 `runHealthCheck()`를 호출하여 두 스크래퍼를 프로빙합니다.

- **Search**: `scrapeSearchPage(1, "qwen")`을 호출하고 결과를 검증합니다.
- **Model**: `scrapeModelPage({ model_id: "library/qwen3", … })`을 호출하고 태그를 검증합니다.

프로브가 실패하면 `buildHealthAlertMessage()`가 Slack mrkdwn 형식의 페이로드를 포맷팅하고, `sendAlert()`가 설정된 `ALERT_WEBHOOK_URL`로 전송합니다.

### 요청별 알림
API는 실제 사용자의 `GET /search` 또는 `GET /model` 요청이 실패하면 즉시 알림을 트리거합니다. 이를 통해 CSS 선택자 오류를 다음 크론 실행까지 기다리지 않고 수 초 내에 보고합니다.

### 문제 해결 (Troubleshooting)
알림이 발생하면 다음 단계를 수행하세요:
1. **Ollama 페이지 확인**: 알림에 포함된 URL을 확인합니다.
2. **스크래퍼 검사**: `api/src/search/scraper.ts` 또는 `api/src/model/scraper.ts`의 소스 코드를 검토합니다.
3. **로그 확인**: Cloudflare 대시보드에서 워커 로그를 확인합니다.
4. **선택자 업데이트**: HTML 구조가 변경되었다면 스크래퍼의 CSS 선택자를 업데이트합니다.

### 관련 소스 위치

| 관심사 | 파일 | 설명 |
|---|---|---|
| 크론 트리거 설정 | `api/wrangler.toml` | 헬스 체크를 위한 매시간 크론 스케줄을 정의합니다. |
| 스케줄 핸들러 | `api/src/index.ts` | Cloudflare Workers 크론 트리거의 `scheduled` export 진입점입니다. |
| 헬스 체크 로직 | `api/src/index.ts` | `runHealthCheck()`는 스크래퍼를 프로빙하고 결과를 `HealthStatus` 객체로 집계합니다. |
| 알림 메시지 빌더 | `api/src/index.ts` | `buildHealthAlertMessage()`는 헬스 상태를 Slack 호환 mrkdwn 문자열로 포맷팅합니다. |
| 알림 발송 함수 | `api/src/index.ts` | `sendAlert()`는 설정된 웹훅 URL로 POST 요청을 수행합니다. |
| 요청별 알림 | `api/src/index.ts` | 라우트 핸들러의 `catch` 블록에서 스크래퍼 실패 시 알림을 트리거합니다. |

---

## 2. 스키마 검증 파이프라인

단일 [OpenAPI 3.0 명세](../api/openapi.json)가 API, TypeScript 클라이언트, Python 클라이언트 세 레이어의 진실의 원천(ground truth)입니다. CI 파이프라인은 스키마 일관성을 강제합니다.

### 명세 생성 방식
`api/src/schemas.ts`에서 요청·응답 형태를 **Zod 스키마**로 정의합니다. `api/src/index.ts`의 API 라우트는 `@hono/zod-openapi`의 `createRoute()`를 사용하여 이 스키마들을 엔드포인트에 연결합니다. 빌드 스크립트를 실행하면 이 정의들로부터 명세가 재생성됩니다.

```bash
pnpm --filter ollama-models-api gen-openapi
```

### CI 강제 적용
`.github/workflows/ci.yml`의 CI 파이프라인은 `api/openapi.json`을 재생성하고 커밋된 버전과 비교합니다. 두 파일이 다르면 빌드가 실패하여 동기화되지 않은 스키마 변경이 머지되는 것을 방지합니다.

### 문제 해결 (Troubleshooting)
CI 빌드가 오래된 명세로 인해 실패하면:
1. 로컬에서 `pnpm --filter ollama-models-api gen-openapi`를 실행합니다.
2. 업데이트된 `api/openapi.json` 파일을 커밋합니다.
3. 변경 사항을 저장소에 푸시합니다.

### 관련 소스 위치

| 관심사 | 파일 |
|---|---|
| Zod 스키마 정의 | `api/src/schemas.ts` |
| OpenAPI 라우트 등록 | `api/src/index.ts` |
| 명세 생성 스크립트 | `api/scripts/gen-openapi.ts` |
| 커밋된 OpenAPI 명세 | `api/openapi.json` |
| CI 파이프라인 | `.github/workflows/ci.yml` |
| TS 클라이언트 통합 테스트 | `packages/ts-client/src/__tests__/integration.test.ts` |
| Python 통합 테스트 | `packages/py-client/tests/test_integration.py` |
| mock Node.js 서버 | `api/scripts/serve-for-ci.ts` |
