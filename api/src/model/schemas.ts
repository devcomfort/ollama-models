import { z } from '@hono/zod-openapi';

/**
 * Query parameters for GET /model endpoint.
 *
 * @property name - Model name in `library/{name}`, `{username}/{name}`, or bare `{name}` format (required)
 *                  `library/{name}`, `{username}/{name}`, 또는 단순 `{name}` 형식의 모델 이름 (필수)
 *
 * @example
 * Official library model:
 * ```json
 * // 공식 라이브러리 모델 조회
 * // Query official library model
 * { "name": "library/qwen3" }
 * ```
 *
 * @example
 * Community model:
 * ```json
 * // 커뮤니티 모델 조회 (사용자 이름 포함)
 * // Query community model with username
 * { "name": "alibayram/smollm3" }
 * ```
 */
export const ModelQuerySchema = z.object({
  name: z.string().max(128).openapi({
    description: 'Model identifier in `library/{name}`, `{username}/{name}`, or full URL format (required, max 128 characters) / `library/{name}`, `{username}/{name}`, 또는 전체 URL 형식의 모델 식별자 (필수, 최대 128자)',
    example: 'library/qwen3',
  }),
}).openapi('ModelQuery');

/**
 * Response schema for GET /model endpoint.
 *
 * @property page_url - Canonical URL of the model's tags page (required)
 *                      모델 태그 페이지의 정규 URL (필수)
 * @property id - Pull-ready model ID (no `library/` prefix for official models) (required)
 *                pull 가능한 모델 ID (공식 모델은 `library/` 접두사 없음) (필수)
 * @property tags - Array of all available tags for this model (required)
 *                  이 모델의 모든 사용 가능한 태그 배열 (필수)
 * @property default_tag - The default tag shown on the model page, or `null` if not set (required, nullable)
 *                         모델 페이지에 표시되는 기본 태그, 설정되지 않은 경우 `null` (필수, nullable)
 *
 * @example
 * With default tag:
 * ```json
 * // qwen3 모델의 태그 목록 (latest 태그 있음)
 * // qwen3 model tags with latest tag
 * {
 *   "page_url": "https://ollama.com/library/qwen3/tags",
 *   "id": "qwen3",
 *   "tags": ["qwen3:latest", "qwen3:4b", "qwen3:8b"],
 *   "default_tag": "qwen3:latest"
 * }
 * ```
 *
 * @example
 * Without a default tag:
 * ```json
 * // 커스텀 모델의 태그 목록 (latest 태그 없음)
 * // Custom model tags without latest tag
 * {
 *   "page_url": "https://ollama.com/library/custom-model/tags",
 *   "id": "custom-model",
 *   "tags": ["custom-model:v1"],
 *   "default_tag": null
 * }
 * ```
 */
export const ModelTagsSchema = z.object({
  page_url: z.string().openapi({
    description: "Canonical URL of the model's tags page (required) / 모델 태그 페이지의 정규 URL (필수)",
    example: 'https://ollama.com/library/qwen3/tags',
  }),
  id: z.string().openapi({
    description: 'Pull-ready model ID (no `library/` prefix for official models) (required) / pull 가능한 모델 ID(공식 모델은 `library/` 접두사 없음) (필수)',
    example: 'qwen3',
  }),
  tags: z.array(z.string()).openapi({
    description: 'All available tags for this model (required) / 이 모델의 모든 사용 가능한 태그 (필수)',
    example: ['latest', '7b', '14b'],
  }),
  default_tag: z.string().nullable().openapi({
    description: 'The default tag shown on the model page, or `null` if not set (required, nullable) / 모델 페이지에 표시되는 기본 태그, 설정되지 않은 경우 `null` (필수, nullable)',
    example: 'latest',
  }),
}).openapi('ModelTags');
