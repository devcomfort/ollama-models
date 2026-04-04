/**
 * Response payload returned by the `GET /model` endpoint.
 *
 * All tags belong to the same model page (`page_url`). The `id` is the
 * full `{profile}/{name}` path without a tag (e.g. `library/qwen3`). To build
 * an Ollama-compatible pull identifier, combine `id` and a tag:
 * `${id}:${tag}`.
 *
 * `default_tag` is `"latest"` when that tag exists on the page, otherwise
 * `null` — in which case the caller must pick an explicit tag from `tags`.
 *
 * @example
 * ```typescript
 * const list: ModelTags = {
 *   page_url: 'https://ollama.com/library/qwen3',
 *   id: 'library/qwen3',
 *   tags: ['qwen3:latest', 'qwen3:4b', 'qwen3:8b'],
 *   default_tag: 'qwen3:latest',
 * };
 *
 * // Tags are already pull-ready — use directly:
 * // ollama pull qwen3:latest
 *
 * // Model without a `latest` tag — caller must pick from tags:
 * const noDefault: ModelTags = {
 *   page_url: 'https://ollama.com/library/qwen3',
 *   id: 'library/qwen3',
 *   tags: ['qwen3:4b'],
 *   default_tag: null,
 * };
 * ```
 */
export interface ModelTags {
  /** Absolute URL of the Ollama model page. */
  page_url: string;
  /**
   * Full model path in `{profile}/{name}` form, without a tag.
   * `library/` as the profile means an officially maintained Ollama model.
   */
  id: string;
  /**
   * Pull-ready identifiers for all available weights, e.g.
   * `['qwen3:latest', 'qwen3:4b']`.
   * Pass any entry directly to `ollama pull`.
   */
  tags: string[];
  /**
   * The pull-ready identifier whose tag is `latest`, e.g. `'qwen3:latest'`.
   * `null` when the model has no `latest` tag — the caller must pick from `tags`.
   */
  default_tag: string | null;
}