const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Fetches a URL with automatic retry on network-level failures.
 *
 * Non-2xx HTTP responses are returned as-is (not retried) — only
 * `fetch()`-level exceptions (DNS, connection refused, timeout) trigger
 * a retry. Logs each retry attempt to `console.warn` so you can observe
 * error rates in Cloudflare logs.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: { maxRetries?: number; retryDelayMs?: number },
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const delayMs = opts?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastError = err;
      if (attempt <= maxRetries) {
        console.warn(
          `fetchWithRetry: attempt ${attempt}/${maxRetries + 1} failed for ${url}: ${String(err)}. Retrying in ${delayMs}ms...`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}
