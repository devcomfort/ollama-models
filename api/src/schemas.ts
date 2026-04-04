import { z } from 'zod';

// ─── Shared ───────────────────────────────────────────────────────────────────

export const ModelPageSchema = z.object({
  http_url: z.string(),
  model_id: z.string(),
});

// ─── /search ─────────────────────────────────────────────────────────────────

export const SearchQuerySchema = z.object({
  q: z.string().optional(),
  page: z.string().optional(),
});

export const SearchResultSchema = z.object({
  pages: z.array(ModelPageSchema),
  page_range: z.union([
    z.number(),
    z.object({ from: z.number(), to: z.number() }),
  ]),
  keyword: z.string(),
});

// ─── /model ──────────────────────────────────────────────────────────────────

export const ModelQuerySchema = z.object({
  name: z.string(),
});

export const ModelTagsSchema = z.object({
  page_url: z.string(),
  id: z.string(),
  tags: z.array(z.string()),
  default_tag: z.string().nullable(),
});

// ─── /health ─────────────────────────────────────────────────────────────────

export const CheckResultSchema = z.object({
  ok: z.boolean(),
  count: z.number().int().optional(),
  error: z.string().optional(),
});

export const HealthStatusSchema = z.object({
  ok: z.boolean(),
  timestamp: z.string(),
  checks: z.object({
    search: CheckResultSchema,
    model: CheckResultSchema,
  }),
});

// ─── Error ───────────────────────────────────────────────────────────────────

export const ErrorResponseSchema = z.object({
  error: z.string(),
});
