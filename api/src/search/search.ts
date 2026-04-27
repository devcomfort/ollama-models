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
 * attempts are silently skipped. Results are ordered by page number ascending
 * and cross-page duplicates are removed.
 *
 * 모든 페이지는 동시에 가져온다. `maxRetries` 시도 후에도 실패한 페이지는
 * 조용히 건너뛴다. 결과는 페이지 번호 오름차순으로 정렬되며 페이지 간 중복이
 * 제거된다.
 *
 * @param keyword - Search keyword. Pass an empty string to list all models.
 * @param keyword - 검색 키워드. 빈 문자열을 전달하면 모든 모델을 나열한다.
 * @param range - A 1-based page number, or `{ from, to }` for an inclusive range.
 * @param range - 1부터 시작하는 페이지 번호, 또는 포함 범위 `{ from, to }`.
 * @param maxRetries - Number of additional attempts per page on failure. Defaults to `0`.
 * @param maxRetries - 실패 시 페이지당 추가 시도 횟수. 기본값 `0`.
 * @returns A {@link SearchResult} with deduplicated model pages sorted by page number.
 *   `page_range` reflects the single page number or the full requested range.
 * @returns 페이지 번호순으로 정렬되고 중복이 제거된 모델 페이지를 포함한
 *   {@link SearchResult}. `page_range`는 단일 페이지 번호 또는 전체 요청 범위를 반영한다.
 * @throws {Error} When any individual page fetch fails.
 * @throws {Error} 개별 페이지 가져오기가 실패할 때.
 * @example
 * ```typescript
 * // Single page
 * const result = await search('qwen3', 1);
 *
 * // Range of pages — fetched concurrently, failed pages skipped
 * const result = await search('qwen3', { from: 1, to: 3 }, 2);
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

  pageNumbers
    .map((pageNum, i) => ({ pageNum, result: settled[i] }))
    .sort((a, b) => a.pageNum - b.pageNum)
    .forEach(({ result }) => {
      if (result.status !== 'fulfilled') return;
      for (const entry of result.value) {
        if (!seen.has(entry.http_url)) {
          seen.add(entry.http_url);
          pages.push(entry);
        }
      }
    });

  return { pages, page_range: range, keyword };
}
