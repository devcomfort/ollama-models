/**
 * CI server that runs the actual production Hono app under Node.js.
 *
 * Unlike serve-for-ci.ts (which reimplemented routes as mocks), this file
 * imports the real api/src/index.ts app and serves it via @hono/node-server.
 * The only stubbed layer is fetch() — ollama.com HTML responses are cached
 * in memory so tests are deterministic and fast after the first request.
 *
 * Usage (started by pytest fixture via subprocess):
 *   tsx api/scripts/ci-server.ts
 *
 * The process writes "READY" to stdout after the server is listening so the
 * pytest fixture knows when to proceed.
 */

// Stub the Cloudflare Workers Cache API so Node.js does not throw.
Object.defineProperty(globalThis, 'caches', {
  value: {
    default: {
      match: async () => undefined,
      put: async () => undefined,
    },
  },
  writable: true,
});

import { serve } from '@hono/node-server';
import { app } from '../src/index';

const TEST_ENV = {
  OLLAMA_BASE: 'https://ollama.com',
  OLLAMA_USER_AGENT: 'ollama-models-api/0.1 (+https://github.com/devcomfort/ollama-models)',
  OLLAMA_ACCEPT: 'text/html,application/xhtml+xml',
  OLLAMA_ACCEPT_LANGUAGE: 'en-US,en;q=0.9',
};

// ---------------------------------------------------------------------------
// In-memory HTML cache — fetches each ollama.com URL at most once.
// ---------------------------------------------------------------------------

const htmlCache = new Map<string, string>();

async function fetchCachedHtml(url: string): Promise<string> {
  if (htmlCache.has(url)) return htmlCache.get(url)!;

  const res = await fetch(url, {
    headers: {
      'User-Agent': TEST_ENV.OLLAMA_USER_AGENT,
      Accept: TEST_ENV.OLLAMA_ACCEPT,
      'Accept-Language': TEST_ENV.OLLAMA_ACCEPT_LANGUAGE,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch fixture: HTTP ${res.status} ${url}`);
  }

  const text = await res.text();
  htmlCache.set(url, text);
  return text;
}

// ---------------------------------------------------------------------------
// Intercept fetch calls to ollama.com and serve cached HTML.
// All other requests (e.g. Slack/Discord webhooks) pass through unchanged.
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input.toString();

  if (url.includes('ollama.com')) {
    const html = await fetchCachedHtml(url);
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  return originalFetch(input, init);
};

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

const PORT = Number(process.env['PORT'] ?? 8787);

serve(
  {
    fetch: (req: Request) => app.fetch(req, TEST_ENV),
    port: PORT,
  },
  () => {
    // Write READY so the pytest fixture knows the port is open.
    process.stdout.write('READY\n');
  },
);
