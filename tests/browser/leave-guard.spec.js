import { test, expect } from '@playwright/test';

const origin = process.env.ERONAPLO_PREVIEW_URL || 'http://127.0.0.1:5174/';
const field = (page) => page.getByRole('spinbutton', { name: 'Fekvenyomás 2. sorozat súlya', exact: true });
async function answer(page, accept, action) {
  const prompt = page.waitForEvent('dialog');
  const operation = action();
  const dialog = await prompt;
  expect(dialog.type()).toBe('confirm');
  expect(dialog.message()).toContain('Biztosan vissza szeretnél lépni?');
  await (accept ? dialog.accept() : dialog.dismiss());
  await operation;
}
test.beforeEach(async ({ page }) => {
  await page.route('**/__leave-guard-fixture', (route) => route.fulfill({ contentType: 'text/html', body: `
    <!doctype html><html lang="hu"><head><meta charset="utf-8"></head><body><div id="fixture-root"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/tests/browser/fixtures/leave-guard.jsx');
    </script></body></html>` }));
  await page.goto(new URL('/__leave-guard-fixture#/elozo', origin).href);
  await page.getByRole('link', { name: 'Másik oldal' }).click();
});
async function open(page) {
  await page.getByRole('button', { name: 'Új próbaedzés' }).click();
  await expect(field(page)).toHaveValue('60');
  await expect.poll(() => page.evaluate(() => Boolean(history.state?.eronaploWorkoutGuard))).toBe(true);
  await field(page).fill('72.5');
}

test('visszalépés elutasítása megőrzi az edzést, jóváhagyása bezárja', async ({ page }) => {
  const length = await page.evaluate(() => history.length);
  await open(page);
  expect(await page.evaluate(() => history.length)).toBe(length + 1);
  for (let index = 0; index < 2; index++) {
    await answer(page, false, () => page.evaluate(() => history.back()));
    await expect(field(page)).toHaveValue('72.5');
    await expect.poll(() => page.evaluate(() => Boolean(history.state?.eronaploWorkoutGuard))).toBe(true);
  }
  await answer(page, true, () => page.evaluate(() => history.back()));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Closing the editor consumes its history entry; the next Back is ordinary navigation.
  const prompts = [];
  page.on('dialog', async (dialog) => { prompts.push(dialog.type()); await dialog.dismiss(); });
  await page.goBack();
  await expect(page).toHaveURL(/#\/elozo$/);
  expect(prompts).toEqual([]);
  expect(await page.evaluate(() => window.__fixtureSaves)).toEqual([]);
});

test('Mégse, bezárás és Escape ugyanúgy védi a beírt értékeket', async ({ page }) => {
  for (const action of [
    () => page.getByRole('button', { name: 'Mégse', exact: true }).click(),
    () => page.getByRole('button', { name: 'Ablak bezárása' }).click(),
    () => page.keyboard.press('Escape'),
  ]) {
    await open(page);
    await answer(page, false, action);
    await expect(field(page)).toHaveValue('72.5');
    await answer(page, true, action);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Boolean(history.state?.eronaploWorkoutGuard))).toBe(false);
  }
});

test('hibás mentés után megmarad a védelem, sikeres mentés kérdés nélkül bezár', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__saveMode = 'fail'; });
  await page.getByRole('button', { name: 'Edzés mentése', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Próba mentési hiba');
  await answer(page, false, () => page.evaluate(() => history.back()));
  await expect(field(page)).toHaveValue('72.5');
  const prompts = [];
  page.on('dialog', async (dialog) => { prompts.push(dialog.type()); await dialog.dismiss(); });
  await page.evaluate(() => { window.__saveMode = 'success'; });
  await page.getByRole('button', { name: 'Edzés mentése', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Edzés elmentve');
  expect(prompts).toEqual([]);
  expect(await page.evaluate(() => window.__fixtureSaves.length)).toBe(1);
});

test('folyamatban lévő mentés közben a Vissza nem dobja el az edzést', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__saveMode = 'pending'; });
  await page.getByRole('button', { name: 'Edzés mentése', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mentés…', exact: true })).toBeDisabled();
  await page.evaluate(() => history.back());
  await expect.poll(() => page.evaluate(() => Boolean(history.state?.eronaploWorkoutGuard))).toBe(true);
  await expect(field(page)).toHaveValue('72.5');
  await page.evaluate(() => window.__finishSave());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => window.__fixtureSaves.length)).toBe(1);
});
