# 보안 dependency 업데이트 설계

**상태:** 승인됨
**날짜:** 2026-08-07
**범위:** npm dependency advisory 제거와 호환성 검증

## 1. 배경

GitHub Dependabot은 `pnpm-lock.yaml`과 `api/package.json`, `docs/package.json`에서 26개 open alert를 보고한다. 같은 시점의 `pnpm audit`는 더 최근 advisory를 포함해 High 12개, Moderate 20개, Low 2개 등 총 34개 vulnerability를 보고한다. Python dependency에 대한 open alert는 없다.

이번 작업의 기준은 GitHub에 표시된 26개에 한정하지 않고, 구현 시점의 `pnpm audit` 결과 전체를 제거하는 것이다.

## 2. 목표

- `pnpm audit`의 High, Moderate, Low vulnerability를 모두 0개로 만든다.
- 취약 package를 끌어오는 가장 가까운 직접 dependency를 patched release로 업데이트한다.
- public API endpoint, response schema, TypeScript/Python client contract, 문서 URL을 유지한다.
- lockfile을 clean install로 재현할 수 있게 유지한다.
- 보안과 관계없는 major migration은 포함하지 않는다.

## 3. 제외 범위

다음 package는 새 advisory 경로를 만들지 않는 한 이번 작업에서 major를 올리지 않는다.

- TypeScript 7
- `@cloudflare/workers-types` 5
- `node-html-parser` 9
- 그 밖의 취약하지 않은 direct dependency major

Python manifest는 alert가 없으므로 version constraint를 변경하지 않는다. 다만 Python unit·integration test는 전체 실행한다.

## 4. 업데이트 전략

### 4.1 직접 dependency 우선

다음 direct parent를 먼저 업데이트한다.

| 영역 | 현재 기준 | 목표 기준 | 제거할 주요 경로 |
|---|---:|---:|---|
| API runtime | `hono` 4.12.27 | 4.12.34 이상, 현재 안정 release 우선 | Hono CORS·SSR·proxy·language advisory |
| Node integration | `@hono/node-server` 1.19.x | 2.0.5 이상 | node-server advisory |
| Docs runtime | Astro 6.4.8 | 7.1.0 이상 | Astro XSS·path advisory와 `sharp`, `svgo` 경로 |
| Docs framework | Starlight 0.38.5 | Astro 7 호환 release | `js-yaml` 경로와 Astro 7 compatibility |
| Workspace tooling | Nx 23.0.1 | 23.0.2 이상 | Nx, `axios`, `brace-expansion` 경로 |
| Workers tooling | Wrangler 4.105.0 | patched Miniflare를 포함한 현재 4.x | `undici`, `sharp` 경로 |
| Test tooling | Vitest 4.1.9 계열 | patched current 4.x | Vite의 `postcss`, `nanoid` 경로 |

선택한 정책은 **현재 major 우선**이다. 설치 시점의 latest release가 최소 patched version보다 높더라도 같은 major의 안전한 release까지만 업데이트한다. 다음 순서를 고정한다.

1. 현재 major의 최신 patched release를 적용한다.
2. `pnpm audit`를 다시 실행한다.
3. 현재 major에서 해결할 수 없는 경고에만 필요한 parent major 또는 최소 override를 적용한다.
4. 보안상 필요한 Astro 7과 `@hono/node-server` 2는 격리된 major update로 허용한다.

### 4.2 전이 dependency 처리

Direct parent 업데이트 후 `pnpm audit`를 다시 실행한다. 남은 advisory가 parent release에서 아직 해소되지 않았다면 다음 순서로 처리한다.

1. 같은 parent major의 더 최신 patched release가 있는지 확인한다.
2. 해당 release가 없으면 `pnpm.overrides`에 advisory의 최소 patched version 이상을 지정한다.
3. Override를 적용한 실제 dependency tree가 parent의 declared range와 runtime contract를 만족하는지 `pnpm why`와 전체 검증으로 확인한다.

Override는 advisory 하나 이상을 제거하는 항목만 남긴다. 임시 `latest` 범위나 설명되지 않는 broad override는 추가하지 않는다.

## 5. 호환성 수정 원칙

Dependency 업데이트로 compile 또는 build 오류가 발생하면 다음 범위에서만 수정한다.

- Astro 7·Starlight config와 MDX compatibility
- `@hono/node-server` 2의 server bootstrap API
- Hono OpenAPI handler type contract
- Wrangler·Miniflare config 또는 test runtime compatibility
- Vitest의 설정·coverage API compatibility

기존 route handler, validation, middleware를 mock server로 다시 구현하지 않는다. API integration은 production Hono `app`을 그대로 사용한다.

## 6. 검증

### 6.1 설치와 감사

- `pnpm install --frozen-lockfile`
- `pnpm audit --json`: High 0, Moderate 0, Low 0
- GitHub Dependabot open alert 재확인
- dependency manifest와 lockfile 사이의 drift 없음

### 6.2 정적 검사와 테스트

- API·TS client TypeScript type-check
- API unit test 64개
- TypeScript client test 28개
- Python client test 39개
- OpenAPI generation 후 `api/openapi.json` diff 없음
- 전체 package build
- docs build
- Playwright E2E

테스트 수가 변경되면 누락으로 감소한 것인지 새 contract test로 증가한 것인지 diff에서 설명한다.

### 6.3 실제 동작 확인

- production Hono app을 사용하는 integration path 실행
- Astro 문서의 `/en/`, `/ko/`, API reference, architecture page를 실제 브라우저로 확인
- 콘솔 오류, 깨진 navigation, locale route 누락이 없음

## 7. 완료 조건

다음 조건을 모두 만족해야 작업이 완료된다.

1. 구현 시점의 `pnpm audit`가 vulnerability 0개를 보고한다.
2. GitHub에 알려진 26개 dependency 경로가 새 lockfile에서 제거된다.
3. 보안과 무관한 direct dependency major가 변경되지 않는다.
4. 모든 정적 검사, 테스트, build, browser smoke check가 통과한다.
5. 공개 API와 client contract가 유지된다.
6. 임시 파일, 불필요한 override, secret이 diff에 없다.

## 8. 변경 전달

Dependency 변경과 필요한 compatibility 수정은 논리적 단위로 나눈다.

1. Security dependency manifest와 lockfile 업데이트
2. Major compatibility 수정이 필요한 경우 해당 runtime별 수정
3. 보안 audit과 검증 증거

현재 요청에는 `커밋`이나 `push` 지시가 없으므로 검증된 변경은 로컬에 유지하고, 원격 반영은 별도 명시적 지시 후 수행한다.
