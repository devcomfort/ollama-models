import type { z } from '@hono/zod-openapi';
import { CheckResultSchema, HealthStatusSchema } from './schemas';

/**
 * Inferred TypeScript type from CheckResultSchema.
 * Represents the result of a single scraper probe during health check.
 */
export type CheckResult = z.infer<typeof CheckResultSchema>;

/**
 * Inferred TypeScript type from HealthStatusSchema.
 * Represents the complete health check response.
 */
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
