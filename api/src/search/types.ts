/** A single 1-based page number, or an inclusive `{ from, to }` page range. */
export type PageRange = number | { from: number; to: number };

/**
 * A model page discovered from the Ollama search results.
 *
 * `model_id` is the full `{profile}/{name}` path. Ollama uses `library` as the
 * fixed profile name for all officially maintained models, so a `library/`
 * prefix always means an official model (e.g. `library/qwen3`). Any other
 * prefix is a community publisher's username (e.g. `alibayram/smollm3`).
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
  /** Absolute URL of the Ollama model page. */
  http_url: string;
  /**
   * Full model path in `{profile}/{name}` form.
   * `library/` as the profile means an officially maintained Ollama model;
   * any other value is a community publisher's username.
   */
  model_id: string;
}

/**
 * Response payload returned by the `GET /search` endpoint.
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
  /** Model pages found on the requested search results page. */
  pages: ModelPage[];
  /** The page or range of pages that was requested. */
  page_range: PageRange;
  /** Search keyword used for the request. */
  keyword: string;
}
