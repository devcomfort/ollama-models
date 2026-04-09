/**
 * Shared configuration for integration tests.
 *
 * All values are read from environment variables so CI or a developer can
 * override them without touching test code.
 *
 * @example
 * ```sh
 * OLLAMA_TEST_MODEL=mistral pnpm test:integration
 * OLLAMA_TEST_MODEL=mistral OLLAMA_NO_RESULTS_MODEL=fake-xyz pnpm test
 * ```
 */

/** Model keyword used for search and model-tag integration tests. */
export const TEST_MODEL = process.env['OLLAMA_TEST_MODEL'] ?? 'qwen3';

/** Non-existent model name for testing empty/no-results scenarios. */
export const NO_RESULTS_MODEL = process.env['OLLAMA_NO_RESULTS_MODEL'] ?? 'xyzabc-nonexistent-model-0000';
