import { scrapeSearchPage } from './scraper';
import type { ModelPage, PageRange, SearchResult } from './types';

export type { PageRange };

interface Env {
  OLLAMA_BASE: string;
  OLLAMA_USER_AGENT: string;
  OLLAMA_ACCEPT: string;
  OLLAMA_ACCEPT_LANGUAGE: string;
}

/**
 * Searches Ollama for models matching `keyword` across one or more pages.
 *
 * 하나 이상의 페이지에서 `keyword`와 일치하는 모델을 검색한다.
 *
 * All pages are fetched concurrently. Each page goes through `fetchWithRetry`
 * (2 retries internally). Pages that still fail are reported in `failed_pages`.
 * If ALL pages fail, the original error is thrown so the route returns 502.
 *
 * 모든 페이지는 동시에 가져온다. 각 페이지는 `fetchWithRetry`(내부 2회 재시도)를
 * 거친다. 여전히 실패한 페이지는 `failed_pages`에 보고된다. 모든 페이지가 실패하면
 * 원본 에러가 throw되어 라우트가 502를 반환한다.
 *
 * @param keyword - Search keyword. Pass an empty string to list all models.
 * @param keyword - 검색 키워드. 빈 문자열을 전달하면 모든 모델을 나열한다.
 * @param range - A 1-based page number, or `{ from, to }` for an inclusive range.
 * @param range - 1부터 시작하는 페이지 번호, 또는 포함 범위 `{ from, to }`.
 * @returns A {@link SearchResult} with deduplicated model pages sorted by page number.
 *   `failed_pages` lists pages that could not be fetched after all retries.
 * @returns 페이지 번호순으로 정렬되고 중복이 제거된 모델 페이지를 포함한
 *   {@link SearchResult}. `failed_pages`는 모든 재시도 후 가져올 수 없었던 페이지를 나열한다.
 * @example
 * ```typescript
 * // Single page
 * const result = await search('qwen3', 1, env);
 *
 * // Range of pages — fetched concurrently, failed pages reported
 * const result = await search('qwen3', { from: 1, to: 3 }, env);
 * // result.failed_pages might be [2] if page 2 failed
 * ```
 */
export async function search(
  keyword: string,
  range: PageRange = 1,
  env: Env,
): Promise<SearchResult> {
  const pageNumbers =
    typeof range === 'number'
      ? [range]
      : Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);

  // Each scrapeSearchPage call goes through fetchWithRetry (2 retries internally).
  // Promise.allSettled lets us collect partial failures without aborting the batch.
  const settled = await Promise.allSettled(
    pageNumbers.map((p) => scrapeSearchPage(p, keyword, env)),
  );

  const seen = new Set<string>();
  const pages: ModelPage[] = [];
  const failedPages: number[] = [];
  let lastError: unknown;

  pageNumbers
    .map((pageNum, i) => ({ pageNum, result: settled[i] }))
    .sort((a, b) => a.pageNum - b.pageNum)
    .forEach(({ pageNum, result }) => {
      if (result.status !== 'fulfilled') {
        failedPages.push(pageNum);
        lastError = result.reason;
        return;
      }
      for (const entry of result.value) {
        if (!seen.has(entry.http_url)) {
          seen.add(entry.http_url);
          pages.push(entry);
        }
      }
    });

  // All pages failed — throw the original error so the route catch block
  // can classify it (ParseError → SCRAPE_PARSE_ERROR, etc.)
  if (pages.length === 0 && failedPages.length === pageNumbers.length) {
    throw lastError;
  }

  const ret: SearchResult = { pages, page_range: range, keyword };
  if (failedPages.length > 0) ret.failed_pages = failedPages;
  return ret;
}
