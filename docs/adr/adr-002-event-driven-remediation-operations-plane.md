# ADR-002: 이벤트 기반 인시던트 감사와 알림 계층

**상태:** Proposed
**날짜:** 2026-08-01
**결정자:** 프로젝트 유지관리자
**범위:** 사용자 오류 발견, D1 감사 원장, 알림 전달, Queue 재시도와 DLQ
**기반:** [ADR-001](adr-001-d1-incident-ledger-and-worker-consolidation.md)의 Main/Tail Worker 경계와 D1 원장

## 결정 요약

이번 단계에서는 자동 코드 수정이나 에이전트 실행을 구현하지 않는다. 익숙하고 검증 가능한 운영 기능만 다음 순서로 추가한다.

1. Main Worker의 실행 결과와 Tail Worker의 오류 신호를 정규화한다.
2. D1에 현재 상태, append-only 감사 event, transactional outbox를 함께 기록한다.
3. Notification Queue와 consumer로 운영자 lifecycle email을 전달한다.
4. 재시도 소진은 DLQ Handler가 D1에 terminal audit으로 기록한다.
5. GitHub health monitor는 `/health` 관찰 전용으로 유지하며 자동 복구를 실행하지 않는다.

## 맥락

ADR-001은 사용자 대면 Main Worker와 실행 trace를 받는 Tail Worker를 분리하고 D1을 인시던트의 정본으로 선택했다. 현재 Tail Worker는 오류가 발생하면 email을 직접 전송한다. 이 방식은 재시도, 중복 제거, 전달 결과, 이후 lifecycle을 일관되게 기록하기 어렵다.

기존 health monitor는 `/health`를 주기적으로 호출한 뒤 자동 복구 workflow를 실행할 수 있었다. 이 경로는 취소한다. 사용자의 요청에서 발생한 `5xx`와 runtime 오류는 Tail Worker에서 발견하고, 운영자는 D1 audit과 email을 통해 확인한다.

이번 결정은 API caller에게 email을 보내는 기능을 추가하지 않는다. 현재 API contract에는 caller identity나 연락처가 없으므로, 알림 수신자는 구성된 운영자 recipient로 한정한다.

## 개념도

```mermaid
flowchart TB
    accTitle: 인시던트 감사와 알림 흐름
    accDescr: Main Worker의 실행 trace는 Tail Worker를 거쳐 D1 상태·감사·outbox에 기록되고 Notification Queue를 통해 운영자 email로 전달된다. GitHub health monitor는 health probe만 수행한다.

    user([API 사용자])
    upstream[Ollama upstream]
    operator([운영자])
    monitor[GitHub health monitor]

    subgraph serving[사용자 대면 계층]
        main[Main Worker]
    end

    subgraph operations[운영 계층]
        tail[Tail Worker]
        d1[(D1: state + audit + outbox)]
        queue[Notification Queue]
        consumer[Notification consumer]
        dlq[Notification DLQ]
        dlqHandler[DLQ Handler]
    end

    user -->|API request| main
    main -->|upstream fetch| upstream
    upstream -->|response| main
    main -->|API response| user
    main -.->|execution trace| tail
    tail -->|normalized error| d1
    d1 -->|publish / recover| queue
    queue --> consumer
    consumer -->|lifecycle email| operator
    queue -.->|exhausted retries| dlq
    dlq --> dlqHandler
    dlqHandler -->|terminal audit| d1
    monitor -.->|observe-only /health probe| main
    monitor -.x|canceled| autoheal[automatic recovery]
```

## 결정

### 1. 운영 계층은 감사와 알림만 소유한다

Main Worker는 API 요청과 응답을 처리한다. Main Worker는 email, D1 write, Queue publish를 동기적으로 호출하지 않는다. 따라서 운영 backlog나 email provider 장애가 사용자 요청의 latency와 응답을 바꾸지 않는다.

기존 alerts Worker를 단계적으로 Operations Worker로 확장할 때, 이 Worker가 소유하는 범위는 다음으로 제한한다.

- Tail execution trace 정규화
- D1 state, audit event, outbox 저장소
- Notification Queue producer와 consumer
- 명시적인 outbox recovery scheduled handler
- Notification DLQ Handler

이번 단계에서는 public operations ingress, 외부 callback, repair workflow, verification runner, agent gateway를 만들지 않는다. 외부 health probe도 별도 ingress로 전환하지 않고 `/health`를 호출해 관찰만 한다.

### 2. 오류 신호를 정규화하고 최소 정보만 저장한다

다음 신호를 감사 후보로 삼는다.

- HTTP status가 `500` 이상인 응답
- runtime execution outcome이 `ok`가 아닌 경우
- `/health` probe의 반복적인 `structure_change` 관찰

D1에는 script/worker 이름, 정규화된 route, status, failure class, public error code, 시각, fingerprint만 저장한다. raw query, 전체 URL, header, upstream HTML, request body, stack trace, secret은 저장하지 않는다.

동일 fingerprint가 동시에 들어오면 하나의 active incident만 만들고 `occurrence_count`와 `last_seen_at`을 갱신한다. 새로운 lifecycle event만 append한다. 자동으로 원인을 추측하거나 코드를 수정하지 않는다.

### 3. 상태, 감사 event, outbox는 같은 D1 transaction으로 기록한다

기존 `incidents` 상태 테이블을 유지하고 다음 논리 record를 추가한다.

| Record | 책임 | 핵심 invariant |
|---|---|---|
| `incidents` | fingerprint별 현재 상태 | active fingerprint당 open incident는 하나다. |
| `incident_events` | 발견, 반복, 전달 실패, DLQ 등 append-only 기록 | `event_id`는 안정적이며 기록 후 수정하지 않는다. |
| `outbox_events` | Notification Queue로 보낼 business event | 상태 변경과 같은 D1 transaction으로 commit한다. |
| `consumer_deliveries` | Queue consumer claim과 완료 상태 | `(consumer_name, event_id)`는 unique다. |
| `notification_deliveries` | recipient별 email 전달 시도 | 같은 event와 recipient는 멱등 처리한다. |

D1 transaction은 Queue publish를 포함하지 않는다. transaction이 성공한 뒤 outbox row를 claim하여 Queue에 publish하고, 실패한 publish는 recovery가 다시 시도한다. D1을 Queue producer처럼 취급하지 않는다.

### 4. Notification Queue와 outbox recovery를 사용한다

Notification Queue는 발견, 반복, email delivery failure, retry budget 소진, DLQ terminal 같은 lifecycle event를 전달한다. payload는 `event_id`, `incident_id`, event type, schema version, 발생 시각처럼 최소한의 식별 정보만 포함하고, 상세 정보는 D1에서 typed query로 읽는다.

Operations Worker는 `* * * * *` scheduled handler로 `published_at IS NULL` 또는 만료된 claim의 outbox row를 재발행한다. 이 handler는 reminder를 생성하지 않으며, 시간만으로 incident 상태를 바꾸지 않는다.

전달은 at-least-once다. 오래된 claim이 Queue에 중복 publish할 수 있으므로 consumer와 email delivery record는 멱등이어야 한다. 물리적인 email provider 경계에서는 드문 중복 email을 완전히 제거하지 못할 수 있다.

### 5. 알림은 운영자 lifecycle email로 한정한다

Notification consumer는 구성된 운영자 recipient에게 다음 상태를 요약해 보낸다.

- 새로운 incident 발견
- 동일 fingerprint 반복
- notification retry 소진
- incident resolved 또는 human follow-up 필요

`dlq_terminal`은 운영자 email event가 아니다. DLQ Handler가 D1 audit-only event로 기록하며, delivery 상태는 D1에서 확인한다.

세부 evidence와 내부 오류는 D1 audit에 보관하고 email에는 포함하지 않는다. API caller에게 별도 알림을 보내지 않는다.

### 6. Notification DLQ는 재삽입하지 않는 terminal audit만 기록한다

DLQ Handler는 원래 `event_id`를 기준으로 `(consumer_name, event_id)`를 원자적으로 claim한다. 한 번만 다음을 기록한다.

1. `incident_events`에 `event_type = 'dlq_terminal'`인 terminal delivery failure event를 append한다.
2. `notification_deliveries`를 `failed` 상태로 갱신한다.
3. 해당 terminal event에는 `requeueable = false`를 기록하고 outbox row를 만들지 않는다.

`dlq_terminal`은 Notification Queue에 publish하지 않으며, Notification consumer와 DLQ Handler가 다시 처리하지 않는다. 따라서 terminal event 자체가 새 retry나 email을 만들 수 없다. 운영자 email이 아니라 D1 audit가 최종 전달 경계이며, handler의 책임은 audit이지 자동 복구가 아니다.

### 7. 자동 복구와 에이전트 실행은 취소하고 보류한다

다음 항목은 이번 범위에서 구현하지 않는다.

- `auto-heal.yml` 실행 및 health monitor의 자동 복구 workflow 호출
- HTML selector 자동 patch와 자동 PR 생성
- agent gateway 또는 외부 coding agent 호출
- repair/verification Queue 또는 Workflow
- callback ingress, capability, nonce, OIDC 교환
- 자동 merge와 production deploy

코드 수정이 필요하면 운영자가 D1 event를 확인하고 일반 branch, test, PR 절차로 처리한다. 자동 복구를 다시 검토할 때는 별도의 ADR과 보안·검증 설계를 먼저 승인한다.

### 8. health monitor는 관찰 전용이다

`health-monitor.yml`은 `/health`를 호출하고 결과를 로그로 남긴다. staging 수동 실행은 관찰과 smoke test 용도로만 사용할 수 있다. 어떠한 결과도 `auto-heal.yml`, PR 생성, 코드 수정 workflow를 자동 실행하지 않는다.

사용자 요청의 `5xx`와 runtime 오류는 GitHub 일정 작업이 아니라 Main Worker의 Tail execution trace를 통해 수집한다. health monitor의 반복 관찰은 별도 incident event로 기록할 수 있지만, 자동 repair trigger는 아니다.

## 유지하는 범위

- Main Worker의 API route와 기존 TS/Python client contract
- scraper와 public `/health` route
- Main Worker와 Tail Worker의 Cloudflare execution trace 경계
- staging Worker와 external `/health` probe
- 구성된 운영자 recipient로의 runtime email
- D1을 정본으로 사용하는 incident 상태와 감사 기록

다음은 이후 별도 결정으로 남긴다.

- API caller 식별과 caller notification
- Durable Objects 기반 coordination
- 자동 code repair, verification, merge, deploy
- raw evidence archive와 장기 보존 정책

## 결과

### 장점

- 사용자 요청 경로와 운영 email 장애가 분리된다.
- 동일 오류의 중복 incident와 중복 delivery를 추적할 수 있다.
- D1 transaction, outbox, Queue retry, DLQ terminal 상태가 하나의 audit 흐름으로 연결된다.
- agent 권한과 자동 코드 변경 위험을 현재 시스템에 도입하지 않는다.

### 비용과 제한

- 이번 단계에는 자동 scraper 수정이 없으므로 코드는 운영자가 고친다.
- Queue와 email provider의 at-least-once 경계에서 중복 email 가능성이 남는다.
- Notification DLQ 자체가 다시 email을 보낼 수는 없으므로 DLQ 상태는 D1 확인이 필요하다.
- repair, verification, deployment correlation은 구현하지 않고 보류한다.

## 검증 조건

구현 시 다음 조건을 Miniflare 또는 동일한 in-process 테스트로 확인한다.

1. 같은 fingerprint의 동시 오류가 하나의 active incident로 합쳐진다.
2. handled `5xx`와 runtime failure가 같은 정규화 경계를 거친다.
3. raw request/upstream/secret 정보가 D1과 email에 남지 않는다.
4. D1 commit 후 Queue publish 실패가 outbox recovery로 재시도된다.
5. duplicate Queue delivery가 새 email을 중복 생성하지 않는다.
6. DLQ event가 terminal audit을 정확히 한 번 남기고 원본 Queue로 loop하지 않는다.
7. Operations Worker 장애가 Main Worker 응답을 실패시키지 않는다.
8. health monitor가 `/health` probe 외 workflow를 실행하지 않는다.

## 참고

- [Cloudflare Tail Workers](https://developers.cloudflare.com/workers/observability/logs/tail-workers/)
- [Cloudflare D1 transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- [Cloudflare Queues](https://developers.cloudflare.com/queues/)
- [Cloudflare Queues retry and dead-letter queues](https://developers.cloudflare.com/queues/configuration/retries/)
- [Cloudflare scheduled handlers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
