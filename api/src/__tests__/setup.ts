// Stub the Cloudflare Workers Cache API (`caches.default`) for Vitest (Node.js).
// In production this is provided by the Workers runtime; tests only need the
// interface to be callable, not functionally correct.
const noopCache: Cache = {
  match: async () => undefined,
  put: async () => undefined,
  delete: async () => false,
  keys: async () => [],
  add: async () => undefined,
  addAll: async () => undefined,
} as unknown as Cache;

Object.defineProperty(globalThis, 'caches', {
  value: { default: noopCache },
  writable: true,
});
