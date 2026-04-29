import { parse } from 'node-html-parser';
import { UpstreamError, ParseError } from '../errors';
import type { ModelPage } from '../search/types';
import type { ModelTags } from './types';

interface Env {
  OLLAMA_USER_AGENT: string;
  OLLAMA_ACCEPT: string;
  OLLAMA_ACCEPT_LANGUAGE: string;
}

/**
 * Fetches a model's `/tags` page and returns all available pull-ready
 * identifiers plus the canonical model page URL.
 *
 * 모델의 `/tags` 페이지를 가져와 사용 가능한 모든 pull 식별자와 정규 모델 페이지 URL을 반환한다.
 *
 * @param page - A {@link ModelPage} obtained from the search scraper. Its
 *   `http_url` is used as the base for the `/tags` request, and `model_id`
 *   is returned as-is in the result.
 * @param page - 검색 스크래퍼에서 얻은 {@link ModelPage}. `http_url`은 `/tags` 요청의
 *   기준 URL로 사용되며, `model_id`는 결과에 그대로 반환된다.
 * @returns A {@link ModelTags} with the model page URL, model ID,
 *   pull-ready tag identifiers, and the default tag (`null` when the model
 *   has no `latest` tag).
 * @returns 모델 페이지 URL, 모델 ID, pull 가능 태그 식별자, 기본 태그(모델에
 *   `latest` 태그가 없으면 `null`)를 포함한 {@link ModelTags}.
 * @throws {UpstreamError} When Ollama returns a non-2xx HTTP status.
 * @throws {UpstreamError} Ollama가 2xx가 아닌 HTTP 상태를 반환할 때.
 * @throws {ParseError} When the CSS selector matches zero tag cards, indicating an
 *   HTML structure change on Ollama's side.
 * @throws {ParseError} CSS 선택자가 태그 카드를 찾지 못해 Ollama 측의 HTML 구조 변경을
 *   나타낼 때.
 * @example
 * ```typescript
 * const page: ModelPage = { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' };
 * const a = await scrapeModelPage(page);
 * // a.id          → 'library/qwen3'
 * // a.tags        → ['qwen3:latest', 'qwen3:4b', ...]
 * // a.default_tag → 'qwen3:latest'
 * ```
 */
export async function scrapeModelPage(page: ModelPage, env: Env): Promise<ModelTags> {
  // === Request ===

  const tagsUrl = `${page.http_url}/tags`;

  const res = await fetch(tagsUrl, {
    headers: {
      'User-Agent': env.OLLAMA_USER_AGENT,
      Accept: env.OLLAMA_ACCEPT,
      'Accept-Language': env.OLLAMA_ACCEPT_LANGUAGE,
    },
  });
  if (!res.ok) {
    throw new UpstreamError(`Ollama returned HTTP ${res.status} for ${tagsUrl}`, res.status);
  }

  // === Parsing ===

  // Tag card links are identified by their href pattern which always
  // starts with "/" and contains ":" (e.g. "/library/qwen3:latest",
  // "/alibayram/smollm3:latest"). This is the most stable attribute
  // across both mobile and desktop renderings of the tag table.
  // The href is stripped of its leading slash and the `library/` prefix
  // so official models produce a pull-ready identifier like "qwen3:latest".
  // Community model hrefs (e.g. "/alibayram/smollm3:latest") keep their
  // username prefix.
  //
  // 태그 카드 링크는 항상 "/"로 시작하고 ":"를 포함하는 href 패턴으로
  // 식별된다(예: "/library/qwen3:latest", "/alibayram/smollm3:latest").
  // 이는 태그 테이블의 모바일 및 데스크탑 렌더링 모두에서 가장 안정적인 속성이다.
  // href에서 선행 슬래시와 `library/` 접두사를 제거하여 공식 모델은
  // "qwen3:latest"와 같은 pull-ready 식별자를 생성한다.
  // 커뮤니티 모델 href(예: "/alibayram/smollm3:latest")는
  // 사용자명 접두사를 유지한다.
  const root = parse(await res.text());
  const tags: string[] = [];

  for (const el of root.querySelectorAll('a[href^="/"][href*=":"]')) {
    const href = el.getAttribute('href');
    if (href) {
      const pullId = href
        .replace(/^\//, '')        // strip leading /
        .replace(/^library\//, ''); // strip library/ prefix for official models
      if (pullId && !tags.includes(pullId)) tags.push(pullId);
    }
  }

  // === Return ===

  if (tags.length === 0) {
    throw new ParseError(
      'Scraper: no tag cards found on model page. ' +
      "The selector 'a[href^=\"/\"][href*=\":\"]' may no longer match — Ollama's HTML structure may have changed.",
    );
  }

  return {
    page_url: page.http_url,
    id: page.model_id,
    tags,
    default_tag: tags.find(t => t.endsWith(':latest')) ?? null,
  };
}
