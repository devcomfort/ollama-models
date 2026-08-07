# 운영 계층 마이그레이션 계획과 Miniflare 테스트

**문서 성격:** 구현 전 실행 계획
**작성일:** 2026-08-01
**시작 조건:** 운영 계층 설계와 보안 경계가 확정된 뒤 착수

## 목표와 범위

이 계획은 현재의 Tail Worker 직접 email을 **오류 감사 → D1 원장 → 운영자 알림** 흐름으로 바꾸는 최소 작업만 다룬다. 사용자 요청 경로는 유지하고, 운영 처리는 비동기로 분리한다.

이번 계획에서 구현하는 component는 다음뿐이다.

- Tail execution trace에서 HTTP `5xx`와 runtime failure를 정규화하는 handler
- D1 incident state, append-only audit, transactional outbox
- Notification Queue, consumer, notification delivery record
- 명시적인 outbox recovery와 Notification DLQ Handler
- `/health`를 호출하지만 자동 복구를 실행하지 않는 health monitor

다음은 취소 또는 보류한다.

- `auto-heal.yml`과 health monitor의 자동 복구 workflow 호출
- HTML selector 자동 patch, 자동 PR, 자동 merge, production deploy
- agent gateway 또는 외부 coding agent
- repair/verification Queue와 Workflow
- callback ingress, OIDC, capability, nonce 교환
- R2 evidence archive
- API caller 식별과 caller notification

## 현재와 목표

| 현재 | 이 계획의 목표 |
|---|---|
| `workers/alerts/`가 Tail 오류를 직접 email 전송 | Operations Worker가 D1에 기록하고 Notification Queue로 전달 |
| D1에는 incident 상태 중심의 기록만 있음 | state + audit event + outbox + delivery 기록 |
| email retry와 중복 처리가 provider 경계에 있음 | Queue retry, consumer claim, notification idempotency |
| health monitor가 자동 복구 workflow를 호출할 수 있음 | `/health` probe와 로그만 수행 |
| 운영 계층에 in-process 검증이 부족함 | 핵심 경계를 Miniflare/in-process 테스트로 검증 |

## 실행 원칙

1. Main Worker의 API route와 client contract는 바꾸지 않는다.
2. 운영 저장과 email 전송은 Main Worker 요청 경로에서 실행하지 않는다.
3. 원시 요청, upstream HTML, header, secret, stack trace는 D1이나 email에 저장하지 않는다.
4. D1 state 변경, audit event, outbox row는 하나의 transaction으로 commit한다.
5. Queue publish는 transaction 밖에서 실행하고 outbox recovery로 재시도한다.
6. 모든 consumer는 `(consumer_name, event_id)`를 기준으로 멱등 claim한다.
7. 자동 코드 수정이나 agent 실행은 추가하지 않는다.

---

## 단계 0: D1 스키마와 Operations Worker 뼈대

**목표:** 운영 계층의 저장 모델과 실행 경계를 만든다. 기존 production 동작은 바꾸지 않는다.

### 변경 대상

- `workers/operations/` 생성
- `workers/operations/db/migrations/0001_incident_audit.sql` 생성
- `workers/operations/src/index.ts`에 tail, scheduled, queue handler의 최소 dispatcher 추가
- `workers/operations/wrangler.toml`에 D1, Notification Queue, Notification DLQ binding 추가
- `api/wrangler.toml`의 tail consumer 대상을 cutover 시점에 Operations Worker로 변경할 수 있도록 준비

### 최소 테이블

```sql
CREATE TABLE incidents (
  incident_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'open',
  route TEXT NOT NULL,
  failure_class TEXT NOT NULL,
  public_error_code TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE incident_events (
  event_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE outbox_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  destination TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  claim_token TEXT,
  claim_expires_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE consumer_deliveries (
  consumer_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed',
  claimed_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (consumer_name, event_id)
);

CREATE TABLE notification_deliveries (
  event_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  PRIMARY KEY (event_id, recipient)
);
```

실제 migration은 SQLite 지원 범위와 기존 `incidents` schema를 확인한 뒤 작성한다. 위 SQL은 논리 contract이며 그대로 복사하는 scaffold가 아니다.

### 완료 조건

- D1 migration이 빈 database와 기존 database에서 명확한 결과를 낸다.
- 모든 row type과 event type이 TypeScript에서 명시된다.
- Main Worker의 response path에는 Operations Worker binding이나 await가 추가되지 않는다.
- D1 repository가 prepared statement만 사용한다.

---

## 단계 1: Tail 오류 정규화와 D1 감사 원장

**목표:** 사용자의 HTTP `5xx`와 runtime failure를 하나의 normalized incident lifecycle로 기록한다.

### 구현 순서

1. Tail payload에서 `scriptName`, normalized route, status, outcome, timestamp만 추출한다.
2. `failure_class`와 public error code를 고정된 enum으로 매핑한다.
3. fingerprint를 route, failure class, public code 등 비민감 필드로 만든다.
4. D1 transaction에서 새 incident 또는 기존 incident의 count/last seen을 갱신한다.
5. 같은 transaction에 `incident_events`와 Notification outbox row를 기록한다.
6. 동일 fingerprint의 동시 처리를 unique constraint와 transaction retry로 멱등화한다.

### 저장 금지 항목

- 전체 URL, query string, request body
- request/response header와 인증 정보
- upstream HTML 또는 raw scraper response
- stack trace와 secret

### Miniflare/in-process 검증

- `500`/`502`/`503` 응답이 하나의 normalized event가 된다.
- non-`ok` runtime outcome도 같은 D1 경계를 거친다.
- 같은 fingerprint를 동시에 넣어도 active incident는 하나다.
- raw input이 D1 payload와 email payload에 포함되지 않는다.
- D1 write 실패가 Main Worker 응답의 status를 바꾸지 않는다.

---

## 단계 2: Notification Queue, outbox recovery, DLQ

**목표:** D1에 기록된 lifecycle event를 안전하게 운영자 email로 전달한다.

### 구현 순서

1. Notification Queue와 retry/DLQ를 만든다.
2. outbox publisher가 row를 claim하고 Queue에 publish한다.
3. `* * * * *` scheduled handler가 미발행 또는 만료 claim row만 재발행한다.
4. Notification consumer가 `(consumer_name, event_id)`를 claim한다.
5. `notification_deliveries`로 `(event_id, recipient)` 중복을 막는다.
6. email 성공/실패와 attempt count를 D1에 기록한다.
7. Notification DLQ Handler가 `dlq_terminal` audit-only event를 한 번 기록하고, `requeueable = false`인 terminal event나 follow-up outbox를 Queue에 삽입하지 않도록 한다.

### Miniflare/in-process 검증

- Queue send 실패 후 outbox recovery가 event를 재발행한다.
- 같은 Queue event가 두 번 와도 새 email delivery가 생기지 않는다.
- consumer claim 중복이 새 lifecycle event를 만들지 않는다.
- email provider 실패가 retry 후 DLQ로 이동한다.
- DLQ Handler는 `dlq_terminal` terminal audit 한 건만 남기고, 새 outbox row·Queue message·email을 만들지 않는다.
- scheduled handler가 reminder나 시간만의 incident 상태 변경을 만들지 않는다.

Email provider는 테스트에서 최저 계층만 stub한다. route handler, Tail handler, validation, Queue consumer를 대체하는 mock server는 만들지 않는다.

---

## 단계 3: staging 관찰과 제한된 cutover

**목표:** 실제 Cloudflare 연결을 관찰한 뒤 Operations Worker를 production 경계에 연결한다.

### staging 순서

1. Operations Worker를 별도 staging service와 staging D1에 배포한다.
2. synthetic `5xx`와 runtime failure를 제한된 staging 요청으로 발생시킨다.
3. Tail consumer가 Operations Worker에 전달되는지 확인한다.
4. D1 incident, audit, outbox, delivery row를 확인한다.
5. Notification Queue retry와 DLQ를 의도적으로 한 번 관찰한다.
6. `.github/workflows/health-monitor.yml`을 수동 staging observation으로 실행한다.
7. `/health` probe가 로그만 남기고 어떠한 repair workflow도 실행하지 않는지 확인한다.

### production cutover

- 모든 단계의 검증 조건이 통과한 뒤 `api/wrangler.toml`의 `tail_consumers`를 Operations Worker로 전환한다.
- 기존 direct-email 경로를 같은 배포에서 제거한다.
- cutover 뒤 Main Worker의 API smoke test와 `/health` probe를 실행한다.
- 실패 시 code repair workflow를 실행하지 않고 운영자가 D1 audit을 확인해 rollback한다.

---

## 파일별 변경 목록

### 구현 시 새로 추가

- `workers/operations/wrangler.toml`
- `workers/operations/package.json`
- `workers/operations/tsconfig.json`
- `workers/operations/src/index.ts`
- `workers/operations/src/db/`
- `workers/operations/src/handlers/tail.ts`
- `workers/operations/src/handlers/outbox-recovery.ts`
- `workers/operations/src/handlers/notification.ts`
- `workers/operations/src/handlers/dlq.ts`
- `workers/operations/db/migrations/0001_incident_audit.sql`
- `workers/operations/src/__tests__/`

### 이 범위에서 수정 또는 제거

- `workers/alerts/` — Operations Worker cutover 시 direct email 제거
- `api/wrangler.toml` — 검증된 뒤 tail consumer 대상 변경
- `.github/workflows/health-monitor.yml` — probe-only 유지
- `.github/workflows/auto-heal.yml` — 취소된 workflow이므로 제거
- `README.md`와 `docs/src/content/docs/` — 자동 복구를 기능으로 광고하지 않도록 정리
- `docs/astro.config.mjs` — 취소된 Auto-Heal navigation 제거

### 만들지 않는 파일

- agent gateway, repair workflow, verification runner
- OIDC/callback ingress와 capability exchange
- R2 evidence archive
- 자동 PR/merge/deploy workflow

---

## 완료 기준

계획 완료는 다음을 모두 만족하는 상태다.

- D1 migration과 prepared repository가 동작한다.
- Tail의 HTTP `5xx`와 runtime failure가 normalized incident/audit/outbox로 저장된다.
- 같은 fingerprint와 duplicate Queue delivery가 멱등 처리된다.
- outbox recovery와 Notification DLQ terminal audit이 동작한다.
- Operations 장애가 Main Worker response에 영향을 주지 않는다.
- staging에서 실제 Tail consumer와 `/health` observation을 확인했다.
- `auto-heal.yml`이 존재하지 않고 health monitor가 다른 workflow를 호출하지 않는다.
- README, ADR, migration plan, docs navigation이 모두 자동 복구 취소 상태와 일치한다.

## 비기능 요구사항

- TypeScript strict mode와 `import type` 규칙을 지킨다.
- Queue payload와 D1 event payload는 schema version을 가진다.
- 모든 DB access는 prepared statement를 사용한다.
- consumer는 at-least-once delivery를 전제로 멱등성을 보장한다.
- 운영자 email에는 민감하거나 raw upstream 데이터가 들어가지 않는다.
- 기존 API unit/integration/E2E contract는 변경하지 않는다.

## 참고

- [ADR-001: D1 incident ledger and Worker consolidation](../docs/adr/adr-001-d1-incident-ledger-and-worker-consolidation.md)
- [ADR-002: 이벤트 기반 인시던트 감사와 알림 계층](../docs/adr/adr-002-event-driven-remediation-operations-plane.md)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Cloudflare scheduled handlers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/)
