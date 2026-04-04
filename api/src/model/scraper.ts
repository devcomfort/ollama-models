import { parse } from 'node-html-parser';
import { assert } from 'es-toolkit/util';
import { FETCH_HEADERS } from '../constants';
import type { ModelPage } from '../search/types';
import type { ModelTags } from './types';

/**
 * Fetches a model's `/tags` page and returns all available pull-ready
 * identifiers plus the canonical model page URL.
 *
 * @param page - A {@link ModelPage} obtained from the search scraper. Its
 *   `http_url` is used as the base for the `/tags` request, and `model_id`
 *   is returned as-is in the result.
 * @returns A {@link ModelTags} with the model page URL, model ID,
 *   pull-ready tag identifiers, and the default tag (`null` when the model
 *   has no `latest` tag).
 * @throws {Error} When Ollama returns a non-2xx HTTP status.
 * @throws {Error} When the CSS selector matches zero tag cards, indicating an
 *   HTML structure change on Ollama's side.
 * @example
 * ```typescript
 * const page: ModelPage = { http_url: 'https://ollama.com/library/qwen3', model_id: 'library/qwen3' };
 * const a = await scrapeModelPage(page);
 * // a.id          → 'library/qwen3'
 * // a.tags        → ['qwen3:latest', 'qwen3:4b', ...]
 * // a.default_tag → 'qwen3:latest'
 * ```
 */
export async function scrapeModelPage(page: ModelPage): Promise<ModelTags> {
  // === Request ===

  const tagsUrl = `${page.http_url}/tags`;

  const res = await fetch(tagsUrl, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`Ollama returned HTTP ${res.status} for ${tagsUrl}`);
  }

  // === Parsing ===

  // Tag card links are identified by their "flex flex-col" layout class,
  // which is unique to tag cards and avoids selecting duplicate text links.
  // The href (e.g. "/library/qwen3:latest") is stripped of its leading slash
  // and the `library/` prefix so official models produce a pull-ready
  // identifier like "qwen3:latest". Community model hrefs (e.g.
  // "/alibayram/smollm3:latest") keep their username prefix.
  const root = parse(await res.text());
  const tags: string[] = [];

  for (const el of root.querySelectorAll('a[class*="flex flex-col"]')) {
    const href = el.getAttribute('href');
    if (href) {
      const pullId = href
        .replace(/^\//, '')        // strip leading /
        .replace(/^library\//, ''); // strip library/ prefix for official models
      if (pullId && !tags.includes(pullId)) tags.push(pullId);
    }
  }

  // === Return ===

  assert(tags.length > 0,
    'Scraper: no tag cards found on model page. ' +
    "The selector 'a[class*=\"flex flex-col\"]' may no longer match — Ollama's HTML structure may have changed.",
  );

  return {
    page_url: page.http_url,
    id: page.model_id,
    tags,
    default_tag: tags.find(t => t.endsWith(':latest')) ?? null,
  };
}
