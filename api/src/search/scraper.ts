import { parse } from 'node-html-parser';
import { UpstreamError, ParseError } from '../errors';
import type { ModelPage } from './types';

interface Env {
  OLLAMA_BASE: string;
  OLLAMA_USER_AGENT: string;
  OLLAMA_ACCEPT: string;
  OLLAMA_ACCEPT_LANGUAGE: string;
}

/**
 * Fetches an Ollama search results page and returns unique model page URLs.
 *
 * Ollama 검색 결과 페이지를 가져와 고유한 모델 페이지 URL을 반환한다.
 *
 * Model cards are identified by the CSS selector `a.group.w-full`, which
 * distinguishes them from all navigation and footer links.
 *
 * 모델 카드는 CSS 선택자 `a.group.w-full`로 식별되며, 이는 모든 탐색 및
 * 푸터 링크와 구별된다.
 *
 * @param page - 1-based page number to fetch.
 * @param page - 가져올 1부터 시작하는 페이지 번호.
 * @param keyword - Search keyword. Pass an empty string to list all models.
 * @param keyword - 검색 키워드. 빈 문자열을 전달하면 모든 모델을 나열한다.
 * @returns {@link ModelPage} entries for every distinct model found on the page.
 * @returns 페이지에서 찾은 모든 고유 모델의 {@link ModelPage} 항목.
 * @throws {UpstreamError} When Ollama returns a non-2xx HTTP status.
 * @throws {UpstreamError} Ollama가 2xx가 아닌 HTTP 상태를 반환할 때.
 * @throws {ParseError} When the CSS selector matches zero elements, indicating an
 *   HTML structure change on Ollama's side.
 * @throws {ParseError} CSS 선택자가 요소를 찾지 못해 Ollama 측의 HTML 구조 변경을
 *   나타낼 때.
 * @example
 * ```typescript
 * const pages = await scrapeSearchPage(1, 'qwen3');
 * // [{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }, ...]
 * ```
 */
export async function scrapeSearchPage(page: number, keyword: string, env: Env): Promise<ModelPage[]> {
  const searchUrl = new URL(`${env.OLLAMA_BASE}/search`);
  searchUrl.searchParams.set('page', String(page));
  if (keyword.trim()) searchUrl.searchParams.set('q', keyword.trim());

  const res = await fetch(searchUrl.toString(), {
    headers: {
      'User-Agent': env.OLLAMA_USER_AGENT,
      Accept: env.OLLAMA_ACCEPT,
      'Accept-Language': env.OLLAMA_ACCEPT_LANGUAGE,
    },
  });
  if (!res.ok) {
    throw new UpstreamError(`Ollama returned HTTP ${res.status} for search page`, res.status);
  }

  const root = parse(await res.text());
  const seen = new Set<string>();
  const pages: ModelPage[] = [];

  for (const el of root.querySelectorAll('a.group.w-full.border-b')) {
    const href = el.getAttribute('href');
    if (!href) continue;
    const http_url = `${env.OLLAMA_BASE}${href}`;
    if (!seen.has(http_url)) {
      seen.add(http_url);
      pages.push({ http_url, model_id: href.replace(/^\//, '') });
    }
  }

  if (pages.length === 0) {
    throw new ParseError(
      'Scraper: no model cards found on search page. ' +
      "The selector 'a.group.w-full.border-b' may no longer match — Ollama's HTML structure may have changed.",
    );
  }

  return pages;
}
