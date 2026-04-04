import { parse } from 'node-html-parser';
import { assert } from 'es-toolkit/util';
import { OLLAMA_BASE, FETCH_HEADERS } from '../constants';
import type { ModelPage } from './types';

/**
 * Fetches an Ollama search results page and returns unique model page URLs.
 *
 * Model cards are identified by the CSS selector `a.group.w-full`, which
 * distinguishes them from all navigation and footer links.
 *
 * @param page - 1-based page number to fetch.
 * @param keyword - Search keyword. Pass an empty string to list all models.
 * @returns {@link ModelPage} entries for every distinct model found on the page.
 * @throws {Error} When Ollama returns a non-2xx HTTP status.
 * @throws {Error} When the CSS selector matches zero elements, indicating an
 *   HTML structure change on Ollama's side.
 * @example
 * ```typescript
 * const pages = await scrapeSearchPage(1, 'qwen3');
 * // [{ http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' }, ...]
 * ```
 */
export async function scrapeSearchPage(page: number, keyword: string): Promise<ModelPage[]> {
  const searchUrl = new URL(`${OLLAMA_BASE}/search`);
  searchUrl.searchParams.set('page', String(page));
  if (keyword.trim()) searchUrl.searchParams.set('q', keyword.trim());

  const res = await fetch(searchUrl.toString(), { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`Ollama returned HTTP ${res.status} for search page`);
  }

  const root = parse(await res.text());
  const seen = new Set<string>();
  const pages: ModelPage[] = [];

  for (const el of root.querySelectorAll('a.group.w-full')) {
    const href = el.getAttribute('href');
    if (!href) continue;
    const http_url = `${OLLAMA_BASE}${href}`;
    if (!seen.has(http_url)) {
      seen.add(http_url);
      pages.push({ http_url, model_id: href.replace(/^\//, '') });
    }
  }

  assert(pages.length > 0,
    'Scraper: no model cards found on search page. ' +
    "The selector 'a.group.w-full' may no longer match — Ollama's HTML structure may have changed.",
  );

  return pages;
}
