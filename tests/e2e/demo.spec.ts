import { test, expect } from '@playwright/test';

test.describe('Try Now demo page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/try/');
    await page.waitForLoadState('networkidle');
  });

  test('페이지 제목과 기본 요소가 표시된다', async ({ page }) => {
    await expect(page).toHaveTitle(/Try Now/);
    await expect(page.locator('#title')).toContainText('ollama-models API');
    await expect(page.locator('#search-form')).toBeVisible();
    await expect(page.locator('#model-form')).toBeVisible();
    await expect(page.locator('#health-btn')).toBeVisible();
  });

  test('검색 폼이 제출되면 결과가 표시된다', async ({ page }) => {
    await page.fill('#search-q', 'qwen');
    await page.click('#search-btn');

    // 로딩 상태 확인
    await expect(page.locator('#search-status')).toHaveClass(/loading/);

    // 결과 표시 대기
    await expect(page.locator('#search-status')).toHaveClass(/ok/, { timeout: 15000 });
    await expect(page.locator('#search-result')).toHaveClass(/visible/);

    // JSON 응답 구조 검증
    const code = page.locator('#search-result code');
    const text = await code.textContent();
    const data = JSON.parse(text!);
    expect(data).toHaveProperty('pages');
    expect(data).toHaveProperty('keyword');
    expect(Array.isArray(data.pages)).toBe(true);
    expect(data.pages.length).toBeGreaterThan(0);
  });

  test('모델 태그 조회가 동작한다', async ({ page }) => {
    await page.fill('#model-name', 'library/qwen3');
    await page.click('#model-btn');

    await expect(page.locator('#model-status')).toHaveClass(/ok/, { timeout: 15000 });
    await expect(page.locator('#model-result')).toHaveClass(/visible/);

    const code = page.locator('#model-result code');
    const text = await code.textContent();
    const data = JSON.parse(text!);
    expect(data).toHaveProperty('tags');
    expect(Array.isArray(data.tags)).toBe(true);
    expect(data.tags.length).toBeGreaterThan(0);
  });

  test('헬스 체크가 동작한다', async ({ page }) => {
    await page.click('#health-btn');

    await expect(page.locator('#health-status')).toHaveClass(/ok/, { timeout: 15000 });
    await expect(page.locator('#health-result')).toHaveClass(/visible/);

    const code = page.locator('#health-result code');
    const text = await code.textContent();
    const data = JSON.parse(text!);
    expect(data).toHaveProperty('ok');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('checks');
    expect(data.ok).toBe(true);
  });

  test('빈 검색어는 API를 호출하지 않는다', async ({ page }) => {
    await page.click('#search-btn');

    // 상태가 변경되지 않아야 함 (loading 없음)
    await page.waitForTimeout(1000);
    const statusClass = await page.locator('#search-status').getAttribute('class');
    expect(statusClass).not.toContain('loading');
  });

  test('존재하지 않는 모델은 에러를 표시한다', async ({ page }) => {
    await page.fill('#model-name', 'library/this-model-definitely-does-not-exist-12345');
    await page.click('#model-btn');

    await expect(page.locator('#model-status')).toHaveClass(/err/, { timeout: 15000 });
  });

  test('언어 드롭다운이 동작한다', async ({ page }) => {
    // 영어가 기본
    await expect(page.locator('#title')).toContainText('Try ollama-models API');

    // 한국어로 변경
    await page.click('#lang-trigger');
    await page.click('[data-lang="ko"]');

    await expect(page.locator('#title')).toContainText('ollama-models API 체험하기');
    await expect(page.locator('#search-btn')).toContainText('검색');

    // 다시 영어로
    await page.click('#lang-trigger');
    await page.click('[data-lang="en"]');

    await expect(page.locator('#title')).toContainText('Try ollama-models API');
  });
});

// === Localized documentation routes ===
// Starlight prefixes sidebar links with the active locale, so each generated
// route must render the shared demo in the matching language.
test.describe('Localized Try Now routes', () => {
  // Q. Does the English documentation link open a working English demo route?
  test('영문 문서에서 영문 체험 페이지로 이동한다', async ({ page }) => {
    await page.goto('/en/');
    await page.getByRole('link', { name: 'Try Now', exact: true }).first().click();

    await expect(page).toHaveURL(/\/en\/try\/$/);
    await expect(page.locator('#title')).toHaveText('Try ollama-models API');
    await expect(page.locator('#back-link')).toHaveAttribute('href', '/en/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  // Q. Does the Korean documentation link open a working Korean demo route?
  test('한국어 문서에서 한국어 체험 페이지로 이동한다', async ({ page }) => {
    await page.goto('/ko/');
    await page.getByRole('link', { name: '체험하기', exact: true }).first().click();

    await expect(page).toHaveURL(/\/ko\/try\/$/);
    await expect(page.locator('#title')).toHaveText('ollama-models API 체험하기');
    await expect(page.locator('#back-link')).toHaveAttribute('href', '/ko/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  });

  // Q. Does changing the demo language keep its localized URL in sync?
  test('언어 선택이 지역화된 체험 페이지 URL을 갱신한다', async ({ page }) => {
    await page.goto('/try/');

    await page.click('#lang-trigger');
    await page.click('[data-lang="ko"]');
    await expect(page).toHaveURL(/\/ko\/try\/$/);

    await page.click('#lang-trigger');
    await page.click('[data-lang="en"]');
    await expect(page).toHaveURL(/\/en\/try\/$/);
  });
});
