const OLLAMA_BASE = 'https://ollama.com';

const FETCH_HEADERS: Record<string, string> = {
  'User-Agent': 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * First-path segments that are NOT Ollama usernames.
 * Used to filter out navigation links from search results.
 */
const SKIP_SEGMENTS = new Set([
  'public',
  'search',
  'docs',
  'pricing',
  'signin',
  'signout',
  'download',
  'blog',
  'privacy',
  'terms',
  'library',
  'api',
  'settings',
  'cdn-cgi',
]);

/**
 * Fetches the Ollama search page and returns unique model page URLs.
 *
 * Scrapes two kinds of model links:
 *   - Official library models: /library/{model-name}
 *   - User contributed models: /{username}/{model-name}
 */
export async function scrapeSearchPage(page: number, keyword: string): Promise<string[]> {
  const searchUrl = new URL(`${OLLAMA_BASE}/search`);
  searchUrl.searchParams.set('page', String(page));
  if (keyword.trim()) searchUrl.searchParams.set('q', keyword.trim());

  const res = await fetch(searchUrl.toString(), { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`Ollama returned HTTP ${res.status} for search page`);
  }

  const html = await res.text();
  const seen = new Set<string>();
  const urls: string[] = [];

  const add = (path: string) => {
    const full = `${OLLAMA_BASE}${path}`;
    if (!seen.has(full)) {
      seen.add(full);
      urls.push(full);
    }
  };

  // 1. Official library models: href="/library/{name}"   (no colon → not a tag link)
  for (const m of html.matchAll(/href="(\/library\/[a-zA-Z0-9._-]+)"/g)) {
    add(m[1]);
  }

  // 2. User models: href="/{username}/{model}"   (two segments, username not in skip list)
  for (const m of html.matchAll(/href="\/(([a-zA-Z0-9._-]+)\/([a-zA-Z0-9._-]+))"/g)) {
    const [, path, segment] = m;
    if (!SKIP_SEGMENTS.has(segment)) {
      add(`/${path}`);
    }
  }

  return urls;
}

/**
 * Fetches a model's /tags page and returns all available tag names plus the
 * canonical model page URL.
 *
 * @param modelInput  - Any of the following:
 *   "qwen3"                                    (short name, assumes library/)
 *   "library/qwen3"                            (explicit library path)
 *   "RogerBen/qwen3.5-35b-opus-distill"        (user model)
 *   "https://ollama.com/library/qwen3"         (full URL)
 */
export async function scrapeModelPage(
  modelInput: string,
): Promise<{ tags: string[]; modelPageUrl: string }> {
  // Normalize to a relative path such as "library/qwen3" or "RogerBen/model"
  const path = modelInput
    .replace(/^https?:\/\/ollama\.com\//, '')
    .replace(/^\//, '')
    .replace(/\/tags\/?$/, '');

  // Short names without a slash default to the official library
  const normalizedPath = path.includes('/') ? path : `library/${path}`;

  const tagsUrl = `${OLLAMA_BASE}/${normalizedPath}/tags`;
  const modelPageUrl = `${OLLAMA_BASE}/${normalizedPath}`;

  const res = await fetch(tagsUrl, { headers: FETCH_HEADERS });
  if (!res.ok) {
    throw new Error(`Ollama returned HTTP ${res.status} for ${tagsUrl}`);
  }

  const html = await res.text();
  const seen = new Set<string>();
  const tags: string[] = [];

  // Tags appear as href="/{normalizedPath}:{tag-name}"
  const escapedPath = normalizedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRe = new RegExp(`href="\\/${escapedPath}:([a-zA-Z0-9._:-]+)"`, 'g');

  for (const m of html.matchAll(tagRe)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      tags.push(m[1]);
    }
  }

  // Guarantee at least a default entry when the page has no tag links
  if (tags.length === 0) {
    tags.push('latest');
  }

  return { tags, modelPageUrl };
}
