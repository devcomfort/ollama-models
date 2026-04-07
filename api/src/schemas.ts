import { z } from '@hono/zod-openapi';

// Re-export all schemas from their respective feature modules
// for backward compatibility and centralized imports

export { ModelQuerySchema, ModelTagsSchema } from './model';
export { ModelPageSchema, SearchQuerySchema, SearchResultSchema } from './search';
export { CheckResultSchema, HealthStatusSchema } from './health';

/**
 * Error response schema for failed requests.
 *
 * @property error - Human-readable error message (required)
 *                    사람이 읽을 수 있는 에러 메시지 (필수)
 *
 * @example
 * ```json
 * { "error": "scraper failure: selector 'a.group.w-full' may no longer match" }
 * ```
 */
export const ErrorResponseSchema = z.object({
  error: z.string().openapi({
    description: 'Human-readable error message (required) / 사람이 읽을 수 있는 에러 메시지 (필수)',
  }),
}).openapi('ErrorResponse');
