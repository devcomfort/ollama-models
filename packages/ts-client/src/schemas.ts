function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
import type { ModelTags, ModelPage, SearchResult, CheckResult, HealthStatus } from './types';

// === helpers ===

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

// === per-type assertions ===

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
  if (data['failed_pages'] !== undefined) {
    assert(Array.isArray(data['failed_pages']), 'SearchResult.failed_pages: expected array');
    (data['failed_pages'] as unknown[]).forEach((n, i) =>
      assert(typeof n === 'number', `SearchResult.failed_pages[${i}]: expected number`),
    );
  }
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

/**
 * Asserts that `data` conforms to the {@link CheckResult} shape.
 *
 * @param data - Unknown value to validate.
 * @param context - Label used in error messages (defaults to `"CheckResult"`).
 * @throws When any field is missing or has the wrong type.
 */
export function assertCheckResult(
  data: unknown,
  context = 'CheckResult',
): asserts data is CheckResult {
  assert(isObject(data), `${context}: expected object`);
  assert(typeof data['ok'] === 'boolean', `${context}.ok: expected boolean`);
  if ('count' in data) {
    assert(typeof data['count'] === 'number', `${context}.count: expected number`);
  }
  if ('error' in data) {
    assert(typeof data['error'] === 'string', `${context}.error: expected string`);
  }
  if ('kind' in data && data['kind'] !== null) {
    assert(
      data['kind'] === 'structure_change' || data['kind'] === 'upstream_down' || data['kind'] === 'network_error',
      `${context}.kind: expected 'structure_change' | 'upstream_down' | 'network_error' | null`,
    );
  }
}

/**
 * Asserts that `data` conforms to the {@link HealthStatus} shape.
 *
 * @param data - Unknown value to validate.
 * @throws When any field is missing or has the wrong type.
 */
export function assertHealthStatus(data: unknown): asserts data is HealthStatus {
  assert(isObject(data), 'HealthStatus: expected object');
  assert(typeof data['ok'] === 'boolean', 'HealthStatus.ok: expected boolean');
  assert(typeof data['timestamp'] === 'string', 'HealthStatus.timestamp: expected string');
  assert(isObject(data['checks']), 'HealthStatus.checks: expected object');
  assertCheckResult(data['checks']['search'], 'HealthStatus.checks.search');
  assertCheckResult(data['checks']['model'], 'HealthStatus.checks.model');
  if ('failure_kind' in data && data['failure_kind'] !== null) {
    assert(
      data['failure_kind'] === 'structure_change' || data['failure_kind'] === 'upstream_down' || data['failure_kind'] === 'network_error',
      `HealthStatus.failure_kind: expected 'structure_change' | 'upstream_down' | 'network_error' | null`,
    );
  }
}
