/**
 * A single 1-based page number, or an inclusive `{ from, to }` page range.
 *
 * 1부터 시작하는 단일 페이지 번호, 또는 `{ from, to }` 포함 범위.
 */
export type PageRange = number | { from: number; to: number };

/**
 * A model page discovered from the Ollama search results.
 *
 * Ollama 검색 결과에서 발견된 모델 페이지.
 *
 * `model_id` is the full `{profile}/{name}` path. Ollama uses `library` as the
 * fixed profile name for all officially maintained models, so a `library/`
 * prefix always means an official model (e.g. `library/qwen3`). Any other
 * prefix is a community publisher's username (e.g. `alibayram/smollm3`).
 *
 * `model_id`는 전체 `{profile}/{name}` 경로이다. Ollama는 모든 공식 관리 모델에
 * 대해 `library`를 고정 프로필 이름으로 사용하므로, `library/` 접두사는 항상
 * 공식 모델을 의미한다(예: `library/qwen3`). 다른 접두사는 커뮤니티 게시자의
 * 사용자 이름이다(예: `alibayram/smollm3`).
 *
 * @example
 * ```typescript
 * // Official library model — `library/` prefix identifies it as official.
 * const official: ModelPage = {
 *   http_url: 'https://ollama.com/library/qwen3',
 *   model_id: 'library/qwen3',
 * };
 *
 * // Community model — prefix is the publisher's username.
 * const community: ModelPage = {
 *   http_url: 'https://ollama.com/alibayram/smollm3',
 *   model_id: 'alibayram/smollm3',
 * };
 * ```
 */
export interface ModelPage {
  /**
   * Absolute URL of the Ollama model page.
   *
   * Ollama 모델 페이지의 절대 URL.
   */
  http_url: string;
  /**
   * Full model path in `{profile}/{name}` form.
   * `library/` as the profile means an officially maintained Ollama model;
   * any other value is a community publisher's username.
   *
   * `{profile}/{name}` 형식의 전체 모델 경로.
   * 프로필이 `library/`이면 공식 관리 Ollama 모델이며,
   * 다른 값은 커뮤니티 게시자의 사용자 이름이다.
   */
  model_id: string;
}

/**
 * Response payload returned by the `GET /search` endpoint.
 *
 * `GET /search` 엔드포인트가 반환하는 응답 페이로드.
 *
 * @example
 * ```typescript
 * const result: SearchResult = {
 *   pages: [{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }],
 *   page_range: 1,
 *   keyword: 'qwen3',
 * };
 *
 * // Multi-page result
 * const multi: SearchResult = {
 *   pages: [...],
 *   page_range: { from: 1, to: 3 },
 *   keyword: 'qwen3',
 * };
 * ```
 */
export interface SearchResult {
  /**
   * Model pages found on the requested search results page.
   *
   * 요청한 검색 결과 페이지에서 찾은 모델 페이지.
   */
  pages: ModelPage[];
  /**
   * The page or range of pages that was requested.
   *
   * 요청된 페이지 또는 페이지 범위.
   */
  page_range: PageRange;
  /**
   * Search keyword used for the request.
   *
   * 요청에 사용된 검색 키워드.
   */
  keyword: string;
}
