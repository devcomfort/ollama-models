## 완료된 항목

### OpenAPI 명세 자동 생성 ✅
- `api/src/schemas.ts`: 모든 응답/요청 타입을 Zod 스키마로 정의
- `api/src/index.ts`: `Hono` → `OpenAPIHono` 마이그레이션 (`@hono/zod-openapi` 사용)
- `api/scripts/gen-openapi.ts`: 빌드 시간에 `api/openapi.json` 생성
- `pnpm gen-openapi` 또는 `pnpm --filter ollama-models-api gen-openapi`로 실행
- API 라우트 변경 시 `openapi.json`이 outdated이면 CI에서 실패

### 클라이언트 스키마 동기화 ✅
- TypeScript 클라이언트: API 응답 타입과 이미 동기화되어 있음을 통합 테스트로 검증
- Python 클라이언트: `HealthStatus` 타입의 `checks` 평탄화(flattening)는 의도적 설계 — `types.py`에 문서화
- TS 통합 테스트 (`integration.test.ts`): `vi.stubGlobal('fetch')` → Hono app 경유하여 실제 파서 검증
- Python 통합 테스트 (`test_integration.py`): Node.js mock 서버(`serve-for-ci.ts`) 경유하여 검증

### CI/CD 파이프라인 ✅
- `.github/workflows/ci.yml`: 모든 push/PR에 대해 실행
  - `api` job: 타입체크 → 单元 테스트 → OpenAPI 생성 → stale spec 감지
  - `ts-client` job: 타입체크 → 단위+통합 테스트 (Hono app 직접 라우팅)
  - `py-client` job: 단위 테스트 + Node.js mock 서버 기반 통합 테스트


