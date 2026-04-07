/**
 * Base URL for all Ollama HTTP requests.
 *
 * 모든 Ollama HTTP 요청의 기본 URL.
 */
export const OLLAMA_BASE = 'https://ollama.com';

/**
 * Default HTTP request headers sent with every scraping fetch.
 *
 * 모든 스크래핑 fetch에 전송되는 기본 HTTP 요청 헤더.
 *
 * Includes a descriptive `User-Agent` so Ollama can identify automated
 * traffic, and `Accept` headers that match a real browser to avoid
 * content-type mismatches.
 *
 * Ollama가 자동화 트래픽을 식별할 수 있도록 설명이 포함된 `User-Agent`와,
 * 콘텐츠 타입 불일치를 방지하기 위해 실제 브라우저와 일치하는 `Accept` 헤더를 포함한다.
 */
export const FETCH_HEADERS: Record<string, string> = {
  'User-Agent': 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};
