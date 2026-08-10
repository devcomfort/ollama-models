import { defineConfig, devices } from '@playwright/test';

const useLocalPreview = process.env.PLAYWRIGHT_LOCAL_PREVIEW === 'true';
const localPreviewURL = 'http://127.0.0.1:4321';
const baseURL = useLocalPreview
  ? localPreviewURL
  : (process.env.PLAYWRIGHT_BASE_URL ?? 'https://ollama.devcomfort.me');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  webServer: useLocalPreview
    ? {
        command:
          'pnpm exec nx build docs --skip-nx-cache && pnpm --dir docs exec wrangler pages dev dist --port 4321',
        url: localPreviewURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
