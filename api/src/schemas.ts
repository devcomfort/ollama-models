import { z } from '@hono/zod-openapi';

// Re-export all schemas from their respective feature modules
// for backward compatibility and centralized imports

export { ModelQuerySchema, ModelTagsSchema } from './model';
export { ModelPageSchema, SearchQuerySchema, SearchResultSchema } from './search';
export { CheckResultSchema, HealthStatusSchema } from './health';

/**
 * Error code constants for structured API error responses.
 *
 * 구조화된 API 에러 응답을 위한 에러 코드 상수.
 */
export const ErrorCodes = {
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  SCRAPE_PARSE_ERROR: 'SCRAPE_PARSE_ERROR',
  SCRAPE_UPSTREAM_ERROR: 'SCRAPE_UPSTREAM_ERROR',
  SCRAPE_NO_RESULTS: 'SCRAPE_NO_RESULTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Structured error response schema for API errors.
 *
 * API 에러를 위한 구조화된 에러 응답 스키마.
 *
 * @property code - Machine-readable error code (required)
 *                  기계 판독 가능한 에러 코드 (필수)
 * @property message - Human-readable error summary (required)
 *                     사람이 읽을 수 있는 에러 요약 (필수)
 * @property detail - Additional context for debugging (optional)
 *                    디버깅을 위한 추가 컨텍스트 (선택)
 *
 * @example
 * ```json
 * { "error": { "code": "SCRAPE_PARSE_ERROR", "message": "Failed to parse search results", "detail": "selector 'a.group.w-full' returned 0 elements" } }
 * ```
 */
export const ErrorDetailSchema = z.object({
  code: z.enum([
    ErrorCodes.INVALID_PARAMETER,
    ErrorCodes.SCRAPE_PARSE_ERROR,
    ErrorCodes.SCRAPE_UPSTREAM_ERROR,
    ErrorCodes.SCRAPE_NO_RESULTS,
    ErrorCodes.INTERNAL_ERROR,
  ]).openapi({
    description: 'Machine-readable error code (required) / 기계 판독 가능한 에러 코드 (필수)',
    example: ErrorCodes.SCRAPE_PARSE_ERROR,
  }),
  message: z.string().openapi({
    description: 'Human-readable error summary (required) / 사람이 읽을 수 있는 에러 요약 (필수)',
    example: 'Failed to parse search results',
  }),
  detail: z.string().optional().openapi({
    description: 'Additional context for debugging (optional) / 디버깅을 위한 추가 컨텍스트 (선택)',
    example: "selector 'a.group.w-full' returned 0 elements",
  }),
}).openapi('ErrorDetail');

/**
 * Error response envelope wrapping the structured error detail.
 *
 * 구조화된 에러 상세 정보를 감싸는 에러 응답 래퍼.
 *
 * @example
 * ```json
 * { "error": { "code": "INVALID_PARAMETER", "message": "Query parameter 'q' exceeds maximum length of 200 characters" } }
 * ```
 */
export const ErrorResponseSchema = z.object({
  error: ErrorDetailSchema,
}).openapi('ErrorResponse');
