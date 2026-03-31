import type { SearchResult, ModelList } from './types';

export const DEFAULT_BASE_URL = 'https://ollama-models-api.devcomfort.workers.dev';

export class OllamaModelsClient {
  private readonly baseUrl: string;

  /**
   * @param baseUrl  The base URL of the deployed ollama-models Workers API.
   *                 Defaults to the official hosted instance.
   */
  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Search for models on Ollama.
   *
   * @param keyword  Search term (empty string returns all models)
   * @param page     Page number (1-based)
   */
  async search(keyword = '', page = 1): Promise<SearchResult> {
    const url = new URL(`${this.baseUrl}/search`);
    if (keyword) url.searchParams.set('q', keyword);
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);
    return res.json() as Promise<SearchResult>;
  }

  /**
   * Retrieve all available tags (weights) for a model.
   *
   * @param name  Model identifier in any of these formats:
   *              "qwen3", "library/qwen3",
   *              "RogerBen/qwen3.5-35b-opus-distill",
   *              "https://ollama.com/library/qwen3"
   */
  async getModel(name: string): Promise<ModelList> {
    const url = new URL(`${this.baseUrl}/model`);
    url.searchParams.set('name', name);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Model fetch failed: HTTP ${res.status}`);
    return res.json() as Promise<ModelList>;
  }
}
