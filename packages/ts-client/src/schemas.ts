import { assert } from 'es-toolkit/util';
import type { ModelTags, ModelPage, SearchResult } from './types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

// ─── per-type assertions ──────────────────────────────────────────────────────

/**
 * Asserts that `data` conforms to the {@link ModelPage} shape.
 *
 * @param data - Unknown value to validate.
 * @param context - Label used in error messages (defaults to `"ModelPage"`).
 * @throws When any field is missing or has the wrong type.
 */
export function assertModelPage(
  data: unknown,
  context = 'ModelPage',
): asserts data is ModelPage {
  assert(isObject(data), `${context}: expected object`);
  assert(typeof data['http_url'] === 'string', `${context}.http_url: expected string`);
  assert(typeof data['model_id'] === 'string', `${context}.model_id: expected string`);
}

/**
 * Asserts that `data` conforms to the {@link SearchResult} shape.
 *
 * @param data - Unknown value to validate.
 * @throws When any field is missing or has the wrong type.
 */
export function assertSearchResult(data: unknown): asserts data is SearchResult {
  assert(isObject(data), 'SearchResult: expected object');
  assert(Array.isArray(data['pages']), 'SearchResult.pages: expected array');
  (data['pages'] as unknown[]).forEach((p, i) =>
    assertModelPage(p, `SearchResult.pages[${i}]`),
  );
  const pr = data['page_range'];
  assert(
    typeof pr === 'number' ||
      (isObject(pr) && typeof pr['from'] === 'number' && typeof pr['to'] === 'number'),
    'SearchResult.page_range: expected number or { from: number; to: number }',
  );
  assert(typeof data['keyword'] === 'string', 'SearchResult.keyword: expected string');
}

/**
 * Asserts that `data` conforms to the {@link ModelTags} shape.
 *
 * @param data - Unknown value to validate.
 * @throws When any field is missing or has the wrong type.
 */
export function assertModelTags(data: unknown): asserts data is ModelTags {
  assert(isObject(data), 'ModelTags: expected object');
  assert(typeof data['page_url'] === 'string', 'ModelTags.page_url: expected string');
  assert(typeof data['id'] === 'string', 'ModelTags.id: expected string');
  assert(Array.isArray(data['tags']), 'ModelTags.tags: expected array');
  (data['tags'] as unknown[]).forEach((t, i) =>
    assert(typeof t === 'string', `ModelTags.tags[${i}]: expected string`),
  );
  assert(
    data['default_tag'] === null || typeof data['default_tag'] === 'string',
    'ModelTags.default_tag: expected string or null',
  );
}
