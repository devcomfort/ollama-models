/**
 * Build-time script: generates api/openapi.json from the OpenAPIHono route definitions.
 *
 * Usage:
 *   pnpm --filter ollama-models-api gen-openapi
 *
 * The generated file is consumed by CI to validate that TypeScript and Python
 * client schemas remain in sync with the API contract.
 */

// Stub the Cloudflare Workers Cache API so importing `app` works in Node.js.
Object.defineProperty(globalThis, 'caches', {
  value: {
    default: {
      match: async () => undefined,
      put: async () => undefined,
    },
  },
  writable: true,
});

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'pathe';
import { app } from '../src/index.ts';

const doc = app.getOpenAPIDocument({
  openapi: '3.0.0',
  info: {
    title: 'ollama-models Workers API',
    version: '0.2.0',
    description:
      'Scrapes ollama.com to expose model search and tag listing as a JSON HTTP API. ' +
      'Hosted on Cloudflare Workers.',
  },
  servers: [{ url: 'https://ollama-models-api.devcomfort.workers.dev' }],
});

const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n');
console.log(`OpenAPI spec written to ${outPath}`);
