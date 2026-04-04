/** Base URL for all Ollama HTTP requests. */
export const OLLAMA_BASE = 'https://ollama.com';

/**
 * Default HTTP request headers sent with every scraping fetch.
 *
 * Includes a descriptive `User-Agent` so Ollama can identify automated
 * traffic, and `Accept` headers that match a real browser to avoid
 * content-type mismatches.
 */
export const FETCH_HEADERS: Record<string, string> = {
  'User-Agent': 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};
