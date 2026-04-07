import { z } from '@hono/zod-openapi';

/**
 * Result of a single scraper probe during health check.
 *
 * Used by the `runHealthCheck()` function in `index.ts` to capture the outcome
 * of each scraper test. The `ok` field indicates success, while `count` and
 * `error` provide additional context depending on the result.
 *
 * 헬스 체크 중 단일 스크래퍼 프로브의 결과.
 * `index.ts`의 `runHealthCheck()` 함수에서 각 스크래퍼 테스트의 결과를
 * 캡처하는 데 사용된다. `ok` 필드는 성공 여부를 나타내며, `count`와
 * `error`는 결과에 따라 추가 컨텍스트를 제공한다.
 *
 * @property ok - `true` when the probe returned at least one result without throwing (required)
 *                프로브가 예외 없이 최소 하나의 결과를 반환했을 때 `true` (필수)
 * @property count - Number of results returned by the probe when the check passed (optional)
 *                   체크 통과 시 프로브가 반환한 결과 수 (선택)
 * @property error - Stringified error message when the check failed (optional)
 *                   체크 실패 시 문자열화된 에러 메시지 (선택)
 *
 * @example
 * Successful check:
 * ```json
 * // 프로브 성공 (10개 결과 반환)
 * // Probe succeeded with 10 results
 * { "ok": true, "count": 10 }
 * ```
 *
 * @example
 * Failed check:
 * ```json
 * // 프로브 실패 (선택자 불일치)
 * // Probe failed due to selector mismatch
 * { "ok": false, "error": "selector 'a.group.w-full' may no longer match" }
 * ```
 */
export const CheckResultSchema = z.object({
  ok: z.boolean().openapi({
    description: '`true` when the probe returned at least one result without throwing (required) / 프로브가 예외 없이 최소 하나의 결과를 반환했을 때 `true` (필수)',
  }),
  count: z.number().int().optional().openapi({
    description: 'Number of results returned by the probe when the check passed (optional) / 체크 통과 시 프로브가 반환한 결과 수 (선택)',
  }),
  error: z.string().optional().openapi({
    description: 'Stringified error message when the check failed (optional) / 체크 실패 시 문자열화된 에러 메시지 (선택)',
  }),
}).openapi('CheckResult');

/**
 * Response schema for GET /health endpoint.
 *
 * Returned by the `/health` route handler in `index.ts`. Aggregates the results
 * of both scraper probes (search and model) into a single status object.
 * The `ok` field is `true` only when both probes pass. Used by the health check
 * endpoint and the scheduled cron trigger to monitor scraper health.
 *
 * `index.ts`의 `/health` 라우트 핸들러에서 반환된다. 두 스크래퍼 프로브
 * (search 및 model)의 결과를 단일 상태 객체로 집계한다. `ok` 필드는 두 프로브가
 * 모두 통과했을 때만 `true`가 된다. 헬스 체크 엔드포인트와 예약된 cron 트리거에서
 * 스크래퍼 상태를 모니터링하는 데 사용된다.
 *
 * @property ok - `true` only when every individual check passed (required)
 *                모든 개별 체크가 통과했을 때만 `true` (필수)
 * @property timestamp - ISO 8601 timestamp of when the health check was run (required)
 *                       헬스 체크가 실행된 시점의 ISO 8601 타임스탬프 (필수)
 * @property checks - Per-scraper probe results (search and model) (required)
 *                    스크래퍼별 프로브 결과 (search 및 model) (필수)
 *
 * @example
 * All checks passed:
 * ```json
 * {
 *   "ok": true,
 *   "timestamp": "2026-04-08T12:00:00.000Z",
 *   "checks": {
 *     "search": { "ok": true, "count": 10 },
 *     "model": { "ok": true, "count": 5 }
 *   }
 * }
 * ```
 *
 * @example
 * With failed checks:
 * ```json
 * {
 *   "ok": false,
 *   "timestamp": "2026-04-08T12:00:00.000Z",
 *   "checks": {
 *     "search": { "ok": false, "error": "selector 'a.group.w-full' may no longer match" },
 *     "model": { "ok": true, "count": 3 }
 *   }
 * }
 * ```
 */
export const HealthStatusSchema = z.object({
  ok: z.boolean().openapi({
    description: '`true` only when every individual check passed (required) / 모든 개별 체크가 통과했을 때만 `true` (필수)',
  }),
  timestamp: z.string().openapi({
    description: 'ISO 8601 timestamp of when the health check was run (required) / 헬스 체크가 실행된 시점의 ISO 8601 타임스탬프 (필수)',
    example: '2026-04-05T00:00:00.000Z',
  }),
  checks: z.object({
    search: CheckResultSchema,
    model: CheckResultSchema,
  }).openapi({
    description: 'Per-scraper probe results (required) / 스크래퍼별 프로브 결과 (필수)',
  }),
}).openapi('HealthStatus');
