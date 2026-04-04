// ─── Zod schemas for OpenAPI spec generation ──────────────────────────────────
// z must be imported from @hono/zod-openapi (NOT from 'zod').
// @hono/zod-openapi calls extendZodWithOpenApi(z) internally,
// which adds the .openapi() method to every Zod type.
import { z } from '@hono/zod-openapi';

// ─── ModelPage ────────────────────────────────────────────────────────────────

/**
 * A single Ollama model page entry returned inside a search result.
 * Mirrors {@link import('./search/types').ModelPage}.
 */
export const ModelPageSchema = z
  .object({
    http_url: z
      .string()
      .openapi({ example: 'https://ollama.com/library/qwen3' }),
    model_id: z
      .string()
      .openapi({ example: 'library/qwen3' }),
  })
  .openapi('ModelPage');

// ─── PageRange ────────────────────────────────────────────────────────────────

/**
 * The page or range of pages that was requested.
 *
 * The runtime API always returns a single integer (the requested page number).
 * Simplified to z.number() here for a clean OpenAPI schema; the TypeScript type
 * in search/types.ts retains the full `number | { from, to }` union.
 */
export const PageRangeSchema = z
  .number()
  .int()
  .min(1)
  .openapi({ example: 1, description: 'Requested page number (1-based)' });

// ─── SearchResult ─────────────────────────────────────────────────────────────

/**
 * Response payload of GET /search.
 * Mirrors {@link import('./search/types').SearchResult}.
 */
export const SearchResultSchema = z
  .object({
    pages: z
      .array(ModelPageSchema)
      .openapi({ description: 'Model pages found on the requested search page' }),
    page_range: PageRangeSchema,
    keyword: z
      .string()
      .openapi({ example: 'qwen3', description: 'Search keyword used for the request' }),
  })
  .openapi('SearchResult');

// ─── ModelTags ────────────────────────────────────────────────────────────────

/**
 * Response payload of GET /model.
 * Mirrors {@link import('./model/types').ModelTags}.
 *
 * `default_tag` is nullable — null when the model has no `latest` tag.
 */
export const ModelTagsSchema = z
  .object({
    page_url: z
      .string()
      .openapi({ example: 'https://ollama.com/library/qwen3' }),
    id: z
      .string()
      .openapi({ example: 'library/qwen3' }),
    tags: z
      .array(z.string())
      .openapi({ example: ['qwen3:latest', 'qwen3:4b', 'qwen3:8b'] }),
    default_tag: z
      .string()
      .nullable()
      .openapi({
        example: 'qwen3:latest',
        description: 'Pull-ready tag whose label is "latest". null when no latest tag exists.',
      }),
  })
  .openapi('ModelTags');

// ─── Health check schemas ─────────────────────────────────────────────────────

/**
 * Result of a single scraper probe. Used inside HealthStatus.checks.
 */
export const CheckResultSchema = z
  .object({
    ok: z.boolean().openapi({ example: true }),
    count: z
      .number()
      .int()
      .optional()
      .openapi({ example: 5, description: 'Number of results returned when check passed' }),
    error: z
      .string()
      .optional()
      .openapi({ example: 'Error: selector returned 0 results' }),
  })
  .openapi('CheckResult');

/**
 * Response payload of GET /health.
 * Mirrors the HealthStatus interface in api/src/index.ts.
 */
export const HealthStatusSchema = z
  .object({
    ok: z.boolean().openapi({ example: true }),
    timestamp: z
      .string()
      .openapi({ example: '2026-01-01T00:00:00.000Z', description: 'ISO 8601 timestamp' }),
    checks: z
      .object({
        search: CheckResultSchema,
        model: CheckResultSchema,
      })
      .openapi({ description: 'Per-scraper probe results' }),
  })
  .openapi('HealthStatus');

// ─── Error response ───────────────────────────────────────────────────────────

/**
 * Generic error response shape returned on 4xx / 5xx.
 */
export const ErrorSchema = z
  .object({
    error: z
      .string()
      .openapi({ example: 'Error: selector returned 0 results' }),
  })
  .openapi('ApiError');
