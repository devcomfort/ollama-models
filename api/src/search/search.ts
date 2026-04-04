import { scrapeSearchPage } from './scraper';
import type { ModelPage, PageRange, SearchResult } from './types';

export type { PageRange };

/**
 * Searches Ollama for models matching `keyword` across one or more pages.
 *
 * All pages are fetched concurrently. Pages that fail even after `maxRetries`
 * attempts are silently skipped. Results are ordered by page number ascending
 * and cross-page duplicates are removed.
 *
 * @param keyword - Search keyword. Pass an empty string to list all models.
 * @param range - A 1-based page number, or `{ from, to }` for an inclusive range.
 * @param maxRetries - Number of additional attempts per page on failure. Defaults to `0`.
 * @returns A {@link SearchResult} with deduplicated model pages sorted by page number.
 *   `page_range` reflects the single page number or the full requested range.
 * @throws {Error} When any individual page fetch fails.
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
          return await scrapeSearchPage(p, keyword);
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
