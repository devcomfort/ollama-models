import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const EXPECTED_OPENAPI_VERSION = '3.0.0';
const MAX_ATTEMPTS = 36;
const RETRY_DELAY_MS = 5_000;
const NAVIGATION_TIMEOUT_MS = 5_000;

async function main(): Promise<void> {
  const openAPIURL = process.env.CUSTOM_DOMAIN_OPENAPI_URL;
  const runID = process.env.GITHUB_RUN_ID ?? 'local';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';

  if (!openAPIURL) {
    throw new Error('CUSTOM_DOMAIN_OPENAPI_URL is required.');
  }

  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    const tryPageURL = new URL('/try/', openAPIURL);
    const tryPageResponse = await page.goto(tryPageURL.toString(), {
      timeout: NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });

    if (!tryPageResponse?.ok()) {
      throw new Error(`Custom-domain demo page returned HTTP ${tryPageResponse?.status() ?? 'unknown'}.`);
    }

    let lastStatus: number | undefined;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const requestURL = new URL(openAPIURL);
      requestURL.searchParams.set('run', `${runID}-${runAttempt}-${attempt}`);

      try {
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

        if (result.status >= 200 && result.status < 300) {
          const payload: unknown = JSON.parse(result.body);

          if (
            typeof payload === 'object' &&
            payload !== null &&
            'openapi' in payload &&
            payload.openapi === EXPECTED_OPENAPI_VERSION
          ) {
            console.log('Custom-domain API routing is ready');
            return;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt === MAX_ATTEMPTS) {
        const detail = lastError ?? `last HTTP status ${lastStatus ?? 'unknown'}`;
        throw new Error(
          `Custom-domain API routing did not become ready within the propagation window (${detail}).`,
        );
      }

      console.log(`Waiting for custom-domain API routing (attempt ${attempt}/${MAX_ATTEMPTS})`);
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
