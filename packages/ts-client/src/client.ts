import type { SearchResult, ModelTags, HealthStatus } from './types';
import { assertModelTags, assertSearchResult, assertHealthStatus } from './schemas';

/**
 * Base URL of the officially hosted ollama-models Workers API.
 *
 * Pass a different URL to {@link OllamaModelsClient} when self-hosting.
 */
export const DEFAULT_BASE_URL = 'https://ollama-models-api.devcomfort.workers.dev';

/**
 * HTTP client for the ollama-models Workers API.
 *
 * Provides a typed, promise-based interface over the `GET /search` and
 * `GET /model` endpoints. Create one instance per application and reuse it.
 *
 * @example
 * ```typescript
 * const client = new OllamaModelsClient();
 *
 * // Search for models
 * const { pages } = await client.search('qwen3');
 * console.log(pages[0].http_url);
 *
 * // Get all available tags
 * const { tags, default_tag } = await client.getModel('library/qwen3');
 * console.log(default_tag); // 'qwen3:latest'
 * ```
 */
export class OllamaModelsClient {
  private readonly baseUrl: string;

  /**
   * @param baseUrl - Base URL of the deployed ollama-models Workers API.
   *   Defaults to {@link DEFAULT_BASE_URL} (the official hosted instance).
   *   Trailing slashes are stripped automatically.
   */
  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Search for models on Ollama.
   *
   * @param keyword - Search term. Pass an empty string to list all models.
   * @param page - 1-based page number. Defaults to `1`.
   * @returns A {@link SearchResult} containing matching model pages and
   *   metadata about the requested page.
   * @throws {Error} When the API returns a non-2xx HTTP status.
   * @example
   * ```typescript
   * const { pages, page_range, keyword } = await client.search('qwen3', 1);
   * const firstUrl = pages[0].http_url;
   * ```
   */
  async search(keyword = '', page = 1): Promise<SearchResult> {
    const url = new URL(`${this.baseUrl}/search`);
    if (keyword) url.searchParams.set('q', keyword);
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
    const data: unknown = await res.json();
    assertSearchResult(data);
    return data;
  }

  /**
   * Retrieve all available tags (weights) for a model.
   *
   * @param name - Model identifier in `{profile}/{name}` format, e.g.:
   *   - `"library/qwen3"` — official Ollama library model
   *   - `"RogerBen/qwen3.5-35b-opus-distill"` — community model
   *   - `"https://ollama.com/library/qwen3"` — full URL
   * @returns A {@link ModelTags} with all available weights.
   *   `default_tag` is `null` when the model has no `latest` tag.
   * @throws {Error} When the API returns a non-2xx HTTP status.
   * @example
   * ```typescript
   * const { tags, default_tag } = await client.getModel('library/qwen3');
   * // Pull the default weight: 'qwen3:latest'
   * ```
   */
  async getModel(name: string): Promise<ModelTags> {
    const url = new URL(`${this.baseUrl}/model`);
    url.searchParams.set('name', name);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Model fetch failed: HTTP ${res.status}`);
    const data: unknown = await res.json();
    assertModelTags(data);
    return data;
  }

  /**
   * Run a live health check against both scrapers.
   *
   * @returns A {@link HealthStatus} with per-scraper probe results and an
   *   aggregate `ok` flag.
   * @throws {Error} When the API returns a non-2xx HTTP status.
   * @example
   * ```typescript
   * const { ok, checks } = await client.health();
   * if (!ok) console.error('search error:', checks.search.error);
   * ```
   */
  async health(): Promise<HealthStatus> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error(`Health check failed: HTTP ${res.status}`);
    const data: unknown = await res.json();
    assertHealthStatus(data);
    return data;
  }
}
