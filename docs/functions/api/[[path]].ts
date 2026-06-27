/**
 * Pages Function — proxies /api/* requests to the ollama-models Workers API.
 *
 * This allows the unified domain ollama.devcomfort.me to serve:
 *   /          → docs (Cloudflare Pages)
 *   /try/      → interactive demo (Pages)
 *   /api/*     → API (Cloudflare Workers)
 */
const API_BASE = 'https://ollama-models-api.devcomfort.workers.dev';

export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const apiUrl = `${API_BASE}${url.pathname.replace(/^\/api/, '')}${url.search}`;

  const response = await fetch(apiUrl, {
    method: context.request.method,
    headers: context.request.headers,
  });

  // Clone response to modify headers
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');

  return newResponse;
};
