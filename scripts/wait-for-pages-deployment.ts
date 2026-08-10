import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const MAX_ATTEMPTS = 24;
const RETRY_DELAY_MS = 5_000;
const NAVIGATION_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const markerURL = process.env.DEPLOYMENT_MARKER_URL;
  const expectedSHA = process.env.GITHUB_SHA;
  const runID = process.env.GITHUB_RUN_ID ?? 'local';
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';

  if (!markerURL || !expectedSHA) {
    throw new Error('DEPLOYMENT_MARKER_URL and GITHUB_SHA are required.');
  }

  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    let lastStatus: number | undefined;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const requestURL = new URL(markerURL);
      requestURL.searchParams.set('run', `${runID}-${runAttempt}-${attempt}`);

      try {
        const response = await page.goto(requestURL.toString(), {
          timeout: NAVIGATION_TIMEOUT_MS,
          waitUntil: 'commit',
        });
        lastStatus = response?.status();

        if (response?.ok()) {
          const payload: unknown = await response.json();

          if (
            typeof payload === 'object' &&
            payload !== null &&
            'sha' in payload &&
            payload.sha === expectedSHA
          ) {
            console.log(`Custom domain is serving commit ${expectedSHA}`);
            return;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (attempt === MAX_ATTEMPTS) {
        const detail = lastError ?? `last HTTP status ${lastStatus ?? 'unknown'}`;
        throw new Error(
          `Custom domain did not serve commit ${expectedSHA} within the propagation window (${detail}).`,
        );
      }

      console.log(`Waiting for custom-domain propagation (attempt ${attempt}/${MAX_ATTEMPTS})`);
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
