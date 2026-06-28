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
 * All pages are fetched concurrently. Pages that fail even after `maxRetries`
 * attempts are reported in `failed_pages`. Results are ordered by page number
 * ascending and cross-page duplicates are removed.
 *
 * 모든 페이지는 동시에 가져온다. `maxRetries` 시도 후에도 실패한 페이지는
 * `failed_pages`에 보고된다. 결과는 페이지 번호 오름차순으로 정렬되며
 * 페이지 간 중복이 제거된다.
 *
 * @param keyword - Search keyword. Pass an empty string to list all models.
 * @param keyword - 검색 키워드. 빈 문자열을 전달하면 모든 모델을 나열한다.
 * @param range - A 1-based page number, or `{ from, to }` for an inclusive range.
 * @param range - 1부터 시작하는 페이지 번호, 또는 포함 범위 `{ from, to }`.
 * @param maxRetries - Number of additional attempts per page on failure. Defaults to `0`.
 * @param maxRetries - 실패 시 페이지당 추가 시도 횟수. 기본값 `0`.
 * @returns A {@link SearchResult} with deduplicated model pages sorted by page number.
 *   `failed_pages` lists pages that could not be fetched after all retries.
 * @returns 페이지 번호순으로 정렬되고 중복이 제거된 모델 페이지를 포함한
 *   {@link SearchResult}. `failed_pages`는 모든 재시도 후 가져올 수 없었던 페이지를 나열한다.
 * @example
 * ```typescript
 * // Single page
 * const result = await search('qwen3', 1);
 *
 * // Range of pages — fetched concurrently, failed pages reported
 * const result = await search('qwen3', { from: 1, to: 3 }, 2);
 * // result.failed_pages might be [2] if page 2 failed
 * ```
 */
export async function search(
  keyword: string,
  range: PageRange = 1,
  maxRetries = 0,
  env: Env,
): Promise<SearchResult> {
  const pageNumbers =
    typeof range === 'number'
      ? [range]
      : Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);

  const settled = await Promise.allSettled(
    pageNumbers.map(async (p) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await scrapeSearchPage(p, keyword, env);
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    }),
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
