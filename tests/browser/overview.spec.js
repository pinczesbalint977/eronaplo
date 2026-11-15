import { test, expect } from '@playwright/test';
const origin = process.env.ERONAPLO_PREVIEW_URL || 'http://127.0.0.1:5174/';
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-15T12:00:00Z'));
  await page.route('**/__overview-fixture*', (route) => route.fulfill({ contentType: 'text/html', body: `
    <!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
    <div id="fixture-root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/tests/browser/fixtures/overview.jsx');
    </script></body></html>` }));
});
test('heti összesítők, első edzés óta hetek és hónapok, összterhelés nélkül', async ({ page }) => {
  const writes = [];
  page.on('request', (request) => { if (request.url().endsWith('/documents:commit')) writes.push(request.url()); });
  await page.goto(new URL('/__overview-fixture', origin).href);
  await expect(page.getByText('EZ A HÉT', { exact: true })).toBeVisible();
  const metrics = page.locator('.metric-card');
  await expect(metrics.nth(0).locator('.metric-value')).toHaveText(/8\s*hét/);
  await expect(metrics.nth(1).locator('.metric-value')).toHaveText(/2\s*hónap/);
  await expect(metrics.nth(2).locator('.metric-value')).toHaveText(/7\s*sorozat/);
  await expect(page.locator('.recent-row')).toHaveCount(2);
  await expect(page.getByText(/összterhelés|edzésnap ezen|EZ A HÓNAP/i)).toHaveCount(0);
  const health = page.getByRole('region', { name: 'Heti étkezés és testméretek' });
  await expect(health).toContainText('2/7 nap rögzítve');
  await expect(health.locator('.overview-nutrients article').nth(0)).toContainText(/4\s*200/);
  await expect(health.locator('.overview-nutrients article').nth(0)).toContainText(/2\s*100/);
  await expect(health.locator('.overview-nutrients article').nth(1)).toContainText('250');
  await expect(health.locator('.overview-measurements article').nth(0)).toContainText('80');
  for (const [width, height] of [[320,568], [390,844], [768,1024], [1440,900], [844,390]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/weekly-overview.png', fullPage: true });
  expect(writes).toEqual([]);
});
test('üres heti adatok nem válnak nullává, adatbetöltési hiba mellett az edzések megmaradnak', async ({ page }) => {
  await page.goto(new URL('/__overview-fixture?mode=empty', origin).href);
  await expect(page.locator('.metric-card').nth(0).locator('.metric-value')).toHaveText(/—\s*hét/);
  await expect(page.getByRole('region', { name: 'Heti étkezés és testméretek' })).toContainText('0/7 nap rögzítve');
  await expect(page.locator('.overview-measurements article').first()).toContainText('—');
  await page.goto(new URL('/__overview-fixture?mode=error', origin).href);
  await expect(page.getByRole('alert')).toContainText('A heti napló most nem tölthető be.');
  await expect(page.locator('.recent-row')).toHaveCount(2);
});
