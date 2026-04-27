/**
 * Thrown when ollama.com responds with a non-2xx HTTP status, indicating
 * an upstream service issue (5xx) or unexpected redirect/auth response (4xx).
 *
 * ollama.com이 2xx가 아닌 HTTP 상태를 반환할 때, 업스트림 서비스 문제(500)나
 * 예상치 못한 리디렉션/인증 응답(400)을 나타낸다.
 *
 * Distinct from network errors (fetch rejection) and parse errors (HTML structure change).
 *
 * 네트워크 에러(fetch 거부) 및 파싱 에러(HTML 구조 변경)와 구별된다.
 */
export class UpstreamError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

/**
 * Thrown when ollama.com responds with HTTP 2xx but the expected CSS selectors
 * match zero elements, indicating that ollama.com changed its HTML structure
 * and the scrapers need to be patched.
 *
 * ollama.com이 HTTP 2xx로 응답했지만 예상 CSS 선택자가 요소를 찾지 못해,
 * ollama.com이 HTML 구조를 변경했으며 스크래퍼를 패치해야 함을 나타낸다.
 */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}
