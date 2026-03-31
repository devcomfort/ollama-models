import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { scrapeSearchPage, scrapeModelPage } from './scraper';
import type { SearchResult, ModelList, ModelWeight } from './types';

const app = new Hono();

// Allow cross-origin requests so browser-based clients can call the API
app.use('*', cors());

/**
 * GET /search?q={keyword}&page={n}
 *
 * Returns all model page URLs found on the given Ollama search page.
 */
app.get('/search', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10) || 1);
  const keyword = c.req.query('q') ?? '';

  try {
    const urls = await scrapeSearchPage(page, keyword);
    const result: SearchResult = {
      pages: urls.map((http_url) => ({ http_url })),
      page_id: page,
      keyword,
    };
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

/**
 * GET /model?name={model-name}
 *
 * Returns all available tags (weights) for the specified model.
 *
 * Accepted formats for `name`:
 *   - qwen3
 *   - library/qwen3
 *   - RogerBen/qwen3.5-35b-opus-distill
 *   - https://ollama.com/library/qwen3
 */
app.get('/model', async (c) => {
  const name = c.req.query('name') ?? '';
  if (!name.trim()) {
    return c.json({ error: '`name` query parameter is required' }, 400);
  }

  try {
    const { tags, modelPageUrl } = await scrapeModelPage(name);

    // Derive the Ollama download-ID prefix:
    //   library/qwen3  →  qwen3
    //   RogerBen/foo   →  RogerBen/foo
    const rawPath = name
      .replace(/^https?:\/\/ollama\.com\//, '')
      .replace(/^\//, '')
      .replace(/\/tags\/?$/, '');

    const normalizedPath = rawPath.includes('/') ? rawPath : `library/${rawPath}`;
    const idPrefix = normalizedPath.startsWith('library/')
      ? normalizedPath.slice('library/'.length)
      : normalizedPath;

    const model_list: ModelWeight[] = tags.map((tag) => ({
      http_url: modelPageUrl,
      id: `${idPrefix}:${tag}`,
    }));

    const result: ModelList = {
      model_list,
      default_model_id: tags.includes('latest')
        ? `${idPrefix}:latest`
        : (model_list[0]?.id ?? `${idPrefix}:latest`),
    };

    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});

export default app;
