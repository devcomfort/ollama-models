import { z } from '@hono/zod-openapi';

/**
 * ModelPage represents a single model discovered from search results.
 *
 * @property http_url - Absolute URL of the model page on ollama.com (required)
 *                       ollama.com의 모델 페이지 절대 URL (필수)
 * @property model_id - Model identifier in `library/{name}` or `{username}/{name}` format (required)
 *                       `library/{name}` 또는 `{username}/{name}` 형식의 모델 식별자 (필수)
 *
 * @example
 * ```json
 * // qwen3 검색 결과의 첫 페이지
 * // Page 1 of search results for "qwen3"
 * { "http_url": "https://ollama.com/library/qwen3", "model_id": "library/qwen3" }
 * ```
 *
 * @example
 * Community model:
 * ```json
 * // 커뮤니티 모델 (사용자 이름 포함)
 * // Community model with username prefix
 * { "http_url": "https://ollama.com/alibayram/smollm3", "model_id": "alibayram/smollm3" }
 * ```
 */
export const ModelPageSchema = z.object({
  http_url: z.string().openapi({
    description: 'Absolute URL of the model page on ollama.com (required) / ollama.com의 모델 페이지 절대 URL (필수)',
    example: 'https://ollama.com/library/qwen3',
  }),
  model_id: z.string().openapi({
    description: 'Model identifier in `library/{name}` or `{username}/{name}` format (required) / `library/{name}` 또는 `{username}/{name}` 형식의 모델 식별자 (필수)',
    example: 'library/qwen3',
  }),
}).openapi('ModelPage');

/**
 * Query parameters for GET /search endpoint.
 *
 * @property q - Search keyword (optional)
 *             검색 키워드 (선택)
 * @property page - Page number, 1-based (optional)
 *                  페이지 번호, 1부터 시작 (선택)
 *
 * @example
 * ```json
 * // "qwen3" 키워드로 페이지 1 검색
 * // Search page 1 with keyword "qwen3"
 * { "q": "qwen3", "page": "1" }
 * ```
 *
 * @example
 * List all models (empty keyword):
 * ```json
 * // 모든 모델 목록 조회 (빈 키워드)
 * // List all models with empty keyword
 * { "q": "", "page": "1" }
 * ```
 */
export const SearchQuerySchema = z.object({
  q: z.string().optional().openapi({
    description: 'Search keyword (optional) / 검색 키워드 (선택)',
    example: 'qwen',
  }),
  page: z.string().optional().openapi({
    description: 'Page number, 1-based (optional) / 페이지 번호, 1부터 시작 (선택)',
    example: '1',
  }),
}).openapi('SearchQuery');

/**
 * Response schema for GET /search endpoint.
 *
 * @property pages - Array of model pages matching the query (required)
 *                    쿼리와 일치하는 모델 페이지 배열 (필수)
 * @property page_range - Single page number or {from, to} range object (required)
 *                        단일 페이지 번호 또는 {from, to} 범위 객체 (필수)
 * @property keyword - The search keyword that was used (required)
 *                     사용된 검색 키워드 (필수)
 *
 * @example
 * Single page result:
 * ```json
 * // "qwen" 키워드로 페이지 1 검색한 결과
 * // Search results for "qwen" on page 1
 * {
 *   "pages": [
 *     { "http_url": "https://ollama.com/library/qwen3", "model_id": "library/qwen3" },
 *     { "http_url": "https://ollama.com/library/mistral", "model_id": "library/mistral" }
 *   ],
 *   "page_range": 1,
 *   "keyword": "qwen"
 * }
 * ```
 *
 * @example
 * Page range result:
 * ```json
 * // "llama" 키워드로 페이지 1~3 범위 검색한 결과
 * // Search results for "llama" across pages 1-3
 * {
 *   "pages": [...],
 *   "page_range": { "from": 1, "to": 3 },
 *   "keyword": "llama"
 * }
 * ```
 */
export const SearchResultSchema = z.object({
  pages: z.array(ModelPageSchema).openapi({
    description: 'List of model pages matching the query (required) / 쿼리와 일치하는 모델 페이지 목록 (필수)',
  }),
  page_range: z.union([
    z.number(),
    z.object({ from: z.number(), to: z.number() }),
  ]).openapi({
    description: 'Total number of pages, or a `{from, to}` range when multiple result pages exist (required) / 전체 페이지 수, 또는 여러 결과 페이지가 있을 때 `{from, to}` 범위 (필수)',
  }),
  keyword: z.string().openapi({
    description: 'The search keyword that was used (required) / 사용된 검색 키워드 (필수)',
  }),
}).openapi('SearchResult');
