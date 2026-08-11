import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, devices } from '@playwright/test';

const EXPECTED_API_ERROR_CODE = 'INVALID_PARAMETER';
const MAX_ATTEMPTS = 36;
const RETRY_DELAY_MS = 5_000;
const NAVIGATION_TIMEOUT_MS = 5_000;
const DEMO_ROUTES = [
  { path: '/try/', title: 'Try ollama-models API' },
  { path: '/en/try/', title: 'Try ollama-models API' },
  { path: '/ko/try/', title: 'ollama-models API 체험하기' },
] as const;

async function main(): Promise<void> {
  const customDomainBaseURL = process.env.CUSTOM_DOMAIN_BASE_URL;
  const runID = process.env.GITHUB_RUN_ID ?? 'local';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';

  if (!customDomainBaseURL) {
    throw new Error('CUSTOM_DOMAIN_BASE_URL is required.');
  }

  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({
      userAgent: devices['Desktop Chrome'].userAgent,
    });
    const page = await context.newPage();
    let lastStatus: number | undefined;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const cacheKey = `${runID}-${runAttempt}-${attempt}`;

      try {
        for (const route of DEMO_ROUTES) {
          const routeURL = new URL(route.path, customDomainBaseURL);
          routeURL.searchParams.set('readiness', cacheKey);
          const response = await page.goto(routeURL.toString(), {
            timeout: NAVIGATION_TIMEOUT_MS,
            waitUntil: 'domcontentloaded',
          });

          if (!response?.ok()) {
            throw new Error(
              `${route.path} returned HTTP ${response?.status() ?? 'unknown'}.`,
            );
          }

          const title = (await page.locator('#title').textContent({
            timeout: NAVIGATION_TIMEOUT_MS,
          }))?.trim();

          if (title !== route.title) {
            throw new Error(
              `${route.path} rendered ${JSON.stringify(title)} instead of ${JSON.stringify(route.title)}.`,
            );
          }
        }

        // A validation failure traverses the Pages Function and API Worker without scraping Ollama.
        const requestURL = new URL('/api/model', customDomainBaseURL);
        requestURL.searchParams.set('readiness', cacheKey);
        const result = await page.evaluate(
          async ({ timeout, url }) => {
            const response = await fetch(url, {
              cache: 'no-store',
              headers: { Accept: 'application/json' },
              signal: AbortSignal.timeout(timeout),
            });

            return {
              body: await response.text(),
              status: response.status,
            };
          },
          {
            timeout: NAVIGATION_TIMEOUT_MS,
            url: requestURL.toString(),
          },
        );
        lastStatus = result.status;

        if (result.status !== 400) {
          throw new Error(`/api/model returned HTTP ${result.status} instead of 400.`);
        }

        const payload: unknown = JSON.parse(result.body);
        let errorCode: unknown;

        if (typeof payload === 'object' && payload !== null && 'error' in payload) {
          const { error } = payload;

          if (typeof error === 'object' && error !== null && 'code' in error) {
            errorCode = error.code;
          }
        }

        if (errorCode !== EXPECTED_API_ERROR_CODE) {
          throw new Error(
            `/api/model returned error code ${JSON.stringify(errorCode)} instead of ${EXPECTED_API_ERROR_CODE}.`,
          );
        }

        console.log('Custom-domain static and API routes are ready');
        return;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt === MAX_ATTEMPTS) {
        const detail = lastError ?? `last HTTP status ${lastStatus ?? 'unknown'}`;
        throw new Error(
          `Custom-domain routes did not become ready within the propagation window (${detail}).`,
        );
      }

      console.log(`Waiting for custom-domain routes (attempt ${attempt}/${MAX_ATTEMPTS}): ${lastError}`);
      await sleep(RETRY_DELAY_MS);
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
