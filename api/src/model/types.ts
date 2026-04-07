/**
 * Response payload returned by the `GET /model` endpoint.
 *
 * `GET /model` 엔드포인트가 반환하는 응답 페이로드.
 *
 * All tags belong to the same model page (`page_url`). The `id` is the
 * full `{profile}/{name}` path without a tag (e.g. `library/qwen3`). To build
 * an Ollama-compatible pull identifier, combine `id` and a tag:
 * `${id}:${tag}`.
 *
 * 모든 태그는 동일한 모델 페이지(`page_url`)에 속한다. `id`는 태그 없는 전체
 * `{profile}/{name}` 경로이다(예: `library/qwen3`). Ollama 호환 pull 식별자를
 * 만들려면 `id`와 태그를 조합한다: `${id}:${tag}`.
 *
 * `default_tag` is `"latest"` when that tag exists on the page, otherwise
 * `null` — in which case the caller must pick an explicit tag from `tags`.
 *
 * `default_tag`는 해당 태그가 페이지에 존재할 때 `"latest"`이며, 그렇지 않으면
 * `null`이다 — 이 경우 호출자는 `tags`에서 명시적으로 태그를 선택해야 한다.
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
  /**
   * Absolute URL of the Ollama model page.
   *
   * Ollama 모델 페이지의 절대 URL.
   */
  page_url: string;
  /**
   * Full model path in `{profile}/{name}` form, without a tag.
   * `library/` as the profile means an officially maintained Ollama model.
   *
   * 태그 없는 `{profile}/{name}` 형식의 전체 모델 경로.
   * 프로필이 `library/`이면 공식 관리 모델을 의미한다.
   */
  id: string;
  /**
   * Pull-ready identifiers for all available weights, e.g.
   * `['qwen3:latest', 'qwen3:4b']`.
   * Pass any entry directly to `ollama pull`.
   *
   * 사용 가능한 모든 가중치의 pull 가능 식별자(예: `['qwen3:latest', 'qwen3:4b']`).
   * 어떤 항목이든 `ollama pull`에 직접 전달할 수 있다.
   */
  tags: string[];
  /**
   * The pull-ready identifier whose tag is `latest`, e.g. `'qwen3:latest'`.
   * `null` when the model has no `latest` tag — the caller must pick from `tags`.
   *
   * 태그가 `latest`인 pull 가능 식별자(예: `'qwen3:latest'`).
   * 모델에 `latest` 태그가 없으면 `null`이며, 호출자는 `tags`에서 선택해야 한다.
   */
  default_tag: string | null;
}