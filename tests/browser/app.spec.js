import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { resolveBasePath } from '../../scripts/base-path.mjs';

const productionUrl = `http://127.0.0.1:4173${resolveBasePath(process.env)}`;
const appUrl = 'http://127.0.0.1:5174/';
const firestoreUrl = 'http://127.0.0.1:8080/v1/projects/demo-eronaplo/databases/(default)/documents';
// Synthetic emulator-only accounts, never real user credentials.
const password = `${randomBytes(24).toString('base64url')}aA1!`;
const emails = ['owner-one@example.test', 'owner-two@example.test', 'outsider@example.test'];
const planName = 'Mell nap';
const privateExercise = 'E2E fekvenyomás – csak az első fióké';
const secondExercise = 'E2E evezés';
let allowedIds = [];
const browserErrors = new WeakMap();
test.beforeEach(async ({ context }) => {
  const errors = [];
  browserErrors.set(context, errors);
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
});
test.afterEach(async ({ context }) => {
  // WebKit reports cancelled emulator streaming requests during full navigation.
  const errors = browserErrors.get(context).filter((message) => !/^\/127\.0\.0\.1:(8080|5174)\/google\.firestore\.v1\.Firestore\/Listen\/channel\?.* due to access control checks\.$/.test(message));
  expect(errors).toEqual([]);
});
async function login(page, index) {
  await page.locator('input[name="email"]').fill(emails[index]);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
  if (index < 2) await expect(page.locator('.main-content h1')).toBeVisible();
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
const weight = (page, name, row) => page.getByRole('spinbutton', { name: `${name} ${row}. sorozat súlya`, exact: true });
const reps = (page, name, row) => page.getByRole('spinbutton', { name: `${name} ${row}. sorozat ismétlése`, exact: true });
async function selectDate(page, date) {
  await page.getByLabel('Naptár hónapja', { exact: true }).fill(date.slice(0,7));
  await page.getByRole('button', { name: date, exact: true }).click();
}
async function openSession(page, name = planName) {
  await page.getByRole('button', { name: 'Edzés rögzítése', exact: true }).first().click();
  await page.getByLabel('Edzésterv', { exact: true }).selectOption({ label: name });
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Edzés rögzítése', exact: true })).toBeVisible();
}
async function saveSession(page) {
  await page.getByRole('button', { name: /^(Edzés mentése|Módosítások mentése)$/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('a nyilvános felület minden méreten csak bejelentkezést mutat', async ({ page }) => {
  for (const [width, height] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[844,390]]) {
    await page.setViewportSize({width,height});
    await page.goto(`${productionUrl}#/naplo`);
    await expect(page.getByRole('heading', { name: 'Készen állsz a következőre?' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Edzésnapló.' })).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await noOverflow(page);
  }
  await page.screenshot({ path: 'artifacts/login-landscape.png', fullPage: true });
});

test('a manifest és a service worker a publikus appot offline is betölti', async ({ page, context, request }) => {
  const response = await request.get(`${productionUrl}manifest.webmanifest`);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: resolveBasePath(process.env), scope: resolveBasePath(process.env), orientation: 'any' });
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, productionUrl).href)).ok()).toBe(true);
  await page.goto(productionUrl);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const cachedUrls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (key) => (await (await caches.open(key)).keys()).map((request) => request.url)))).flat());
  expect(cachedUrls.length).toBeGreaterThan(5);
  expect(cachedUrls.every((url) => url.startsWith(new URL(productionUrl).origin))).toBe(true);
  expect(cachedUrls.some((url) => /\/v1\/|documents:commit|accounts:/.test(new URL(url).pathname))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Készen állsz a következőre?' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await context.setOffline(false);
});

test('egy kész gyakorlat ajánlását nem rejti el egy másik gyakorlat lassú vagy hibás előzménye', async ({ page }) => {
  const origin = process.env.ERONAPLO_PREVIEW_URL || appUrl;
  await page.route('**/__history-advice-fixture', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="hu"><head><meta charset="utf-8"></head><body>
      <div id="fixture-root"></div><script type="module">
        import RefreshRuntime from '/@react-refresh';
        RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
        await import('/tests/browser/fixtures/history-advice.jsx');
      </script></body></html>`,
  }));
  const commits = [];
  page.on('request', (request) => { if (request.url().endsWith('/documents:commit')) commits.push(request.url()); });
  await page.goto(new URL('/__history-advice-fixture', origin).href);
  const fast = page.getByRole('region', { name: 'Fixture gyors gyakorlat', exact: true });
  const slow = page.getByRole('region', { name: 'Fixture lassú gyakorlat', exact: true });
  await expect(fast.locator('.weight-recommendation')).toContainText(/Emelj.*ha úgy érzed/i);
  await expect(fast.locator('.series-history')).toContainText('2021. február 3.');
  await expect(slow.locator('.series-history')).toContainText(/keresése/i);
  await expect(slow.getByText(/Emelj.*ha úgy érzed/i)).toHaveCount(0);
  await page.evaluate(() => window.__rejectSlowHistory());
  await expect(slow.getByRole('alert')).toContainText(/előzmény/i);
  await expect(fast.getByRole('alert')).toHaveCount(0);
  await expect(fast.locator('.weight-recommendation')).toContainText(/Emelj.*ha úgy érzed/i);
  await expect(slow.getByText(/Emelj.*ha úgy érzed/i)).toHaveCount(0);
  expect(await page.evaluate(() => window.__historyFixtureWrites)).toEqual([]);
  expect(commits).toEqual([]);
});

test.describe.serial('Valódi Auth és Firestore emulátorral', () => {
  test.beforeAll(async ({ request }) => {
    expect((await request.delete('http://127.0.0.1:9099/emulator/v1/projects/demo-eronaplo/accounts')).ok()).toBe(true);
    const ids = [];
    for (const email of emails) {
      const response = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-test-key', { data: { email, password, returnSecureToken: true } });
      expect(response.ok()).toBe(true);
      ids.push((await response.json()).localId);
    }
    allowedIds = ids.slice(0, 2);
    expect((await request.patch(`${firestoreUrl}/access/allowedUsers`, {
      headers: { Authorization: 'Bearer owner' },
      data: { fields: { uids: { arrayValue: { values: allowedIds.map((uid) => ({ stringValue: uid })) } } } },
    })).ok()).toBe(true);
  });

  test('hibás jelszó és harmadik fiók nem nyitja meg a védett felületet', async ({ page }) => {
    await page.goto(`${appUrl}#/statisztika`);
    await page.locator('input[name="email"]').fill(emails[0]);
    await page.locator('input[name="password"]').fill('incorrect-test-password');
    await page.getByRole('button', { name: 'Bejelentkezés', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('bejelentkezés');
    await login(page, 2);
    await expect(page.getByText('Ehhez a fiókhoz nincs hozzáférés engedélyezve.')).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('strukturált terv, teljes edzés, előtöltés, naptár, változatlan előzmények és fiókelkülönítés', async ({ page, context }) => {
    test.setTimeout(150000);
    const commits = [];
    page.on('request', (request) => { if (request.url().endsWith('/documents:commit')) commits.push(request.postDataJSON()); });
    await page.goto(`${appUrl}#/tervek`);
    await login(page, 0);
    await page.setViewportSize({width:320,height:568});
    await page.getByRole('button', { name: 'Új edzésterv', exact: true }).click();
    await page.getByLabel('Edzésterv neve', { exact: true }).fill(planName);
    await page.getByLabel('Gyakorlat neve', { exact: true }).fill(privateExercise);
    await page.getByLabel('Sorozatok', { exact: true }).fill('2');
    await page.getByLabel('Ismétléscél', { exact: true }).fill('10');
    await page.getByRole('button', { name: /^Gyakorlat hozzáadása/ }).click();
    await page.getByLabel('Gyakorlat neve', { exact: true }).nth(1).fill(secondExercise);
    await page.getByLabel('Sorozatok', { exact: true }).nth(1).fill('1');
    await page.getByLabel('Ismétléscél', { exact: true }).nth(1).fill('12');
    await noOverflow(page);
    expect(await page.getByRole('dialog').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Edzésterv mentése', exact: true }).click();
    await expect(page.getByRole('heading', { name: planName, exact: true })).toBeVisible();
    await page.goto(`${appUrl}#/naplo`);
    await openSession(page);
    await page.getByLabel('Edzés dátuma', { exact: true }).fill('2020-01-06');
    await expect(page.getByRole('dialog').getByRole('heading', { name: privateExercise, exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('heading', { name: secondExercise, exact: true })).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0);
    await weight(page, privateExercise, 1).fill('60');
    await weight(page, privateExercise, 2).fill('80');
    await weight(page, secondExercise, 1).fill('35');
    await reps(page, privateExercise, 1).fill('10');
    await reps(page, privateExercise, 2).fill('10');
    await reps(page, secondExercise, 1).fill('12');
    await page.setViewportSize({width:320,height:568});
    await noOverflow(page);
    await saveSession(page);
    // Both exercise snapshots and all three sets are confirmed by one commit.
    const sessionWrites = commits.at(-1).writes;
    expect(sessionWrites).toHaveLength(5);
    const parents = sessionWrites.filter((write) => /\/workouts\//.test(write.update?.name));
    expect(parents).toHaveLength(2);
    const metadata = parents.map((write) => JSON.parse(write.update.fields.notes.stringValue.replace(/^ERONAPLO_SESSION_V1:/, '')));
    expect(new Set(metadata.map((item) => item.sessionId)).size).toBe(1);
    expect(metadata.map((item) => item.position).sort()).toEqual([0,1]);
    expect(metadata.every((item) => item.planName === planName && item.exerciseCount === 2)).toBe(true);
    const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
    await selectDate(page, today);
    await openSession(page);
    await expect(page.getByLabel('Edzés dátuma', { exact: true })).toHaveValue(today);
    await expect(weight(page, privateExercise, 1)).toHaveValue('60');
    await expect(weight(page, privateExercise, 2)).toHaveValue('80');
    await expect(weight(page, secondExercise, 1)).toHaveValue('35');
    await expect(page.locator('.series-history').first()).toContainText('2020. január 6.');
    await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0);
    await weight(page, privateExercise, 1).fill('65');
    await expect(page.getByRole('dialog').getByText('Fejlődés', { exact: true })).toBeVisible();
    for (const [width,height] of [[320,568],[390,844],[768,1024],[844,390]]) {
      await page.setViewportSize({width,height});
      await noOverflow(page);
    }
    await page.screenshot({path:'artifacts/previous-series.png',fullPage:true});
    await saveSession(page);
    await selectDate(page, today);
    await expect(page.getByRole('heading', { name: planName, exact: true })).toBeVisible();
    await expect(page.getByText(privateExercise, { exact: true })).toBeVisible();
    await page.goto(`${appUrl}#/tervek`);
    await page.getByRole('button', { name: `${planName} terv szerkesztése`, exact: true }).click();
    await page.getByLabel('Gyakorlat neve', { exact: true }).first().fill('E2E jövőbeli gyakorlat');
    await page.getByLabel('Sorozatok', { exact: true }).first().fill('1');
    await page.getByRole('button', { name: 'Módosítások mentése', exact: true }).click();
    await page.goto(`${appUrl}#/naplo`);
    await selectDate(page, today);
    await page.getByRole('button', { name: `${planName} edzés szerkesztése`, exact: true }).click();
    await expect(weight(page, privateExercise, 1)).toHaveValue('65');
    await expect(weight(page, privateExercise, 2)).toHaveValue('80');
    await expect(page.getByRole('dialog').getByText('E2E jövőbeli gyakorlat', { exact: true })).toHaveCount(0);
    await weight(page, privateExercise, 1).fill('67.5');
    await saveSession(page);
    await page.reload();
    await selectDate(page, today);
    await page.getByRole('button', { name: `${planName} edzés szerkesztése`, exact: true }).click();
    await expect(weight(page, privateExercise, 1)).toHaveValue('67.5');
    await page.getByRole('button', { name: 'Mégse', exact: true }).click();
    for (const [width,height] of [[320,568],[390,844],[768,1024],[1024,768],[1440,900],[844,390]]) {
      await page.setViewportSize({width,height});
      for (const route of ['', 'naplo','tervek','statisztika']) {
        await page.goto(`${appUrl}#/${route}`);
        await expect(page.locator('.main-content h1')).toBeVisible();
        await noOverflow(page);
      }
      const navigation = width <=760 || (width <=960 && height <=500) ? 'Mobil navigáció' : 'Fő navigáció';
      await expect(page.getByRole('navigation', { name: navigation })).toBeVisible();
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(appUrl);
    await page.screenshot({path:'artifacts/dashboard-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'artifacts/dashboard-mobile.png',fullPage:true});
    const secondTab = await context.newPage();
    await secondTab.goto(`${appUrl}#/tervek`);
    await expect(secondTab.getByRole('heading', { name: planName, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Kijelentkezés', exact: true }).last().click();
    for (const tab of [page, secondTab]) {
      await expect(tab.getByRole('heading', { name: 'Készen állsz a következőre?' })).toBeVisible();
      await expect(tab.getByText(planName, { exact: true })).toHaveCount(0);
    }
    await page.goto(`${appUrl}#/naplo`);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await login(page, 1);
    await expect(page.getByText(privateExercise, { exact: true })).toHaveCount(0);
    await page.goto(`${appUrl}#/tervek`);
    await expect(page.getByText(planName, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Először készíts egy edzéstervet' })).toBeVisible();
    const stores = await page.evaluate(async () => ({ keys: Object.keys(localStorage), databases: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((db) => db.name) : [] }));
    expect(stores.keys.some((key) => /workout|plan|journal/.test(key))).toBe(false);
    expect(stores.databases.some((name) => name?.startsWith('firestore/'))).toBe(false);
    await page.getByRole('button', { name: 'Kijelentkezés', exact: true }).last().click();
    await expect(page.getByRole('heading', { name: 'Készen állsz a következőre?' })).toBeVisible();
    await login(page, 0);
    await page.goto(`${appUrl}#/naplo`);
    await selectDate(page, today);
    await page.getByRole('button', { name: `${planName} teljes edzés törlése`, exact: true }).click();
    await page.getByRole('button', { name: 'Végleges törlés', exact: true }).click();
    await expect(page.getByRole('button', { name: `${planName} teljes edzés törlése`, exact: true })).toHaveCount(0);
    expect(commits.at(-1).writes).toHaveLength(5);
    expect(commits.at(-1).writes.every((write) => write.delete)).toBe(true);
    await selectDate(page, '2020-01-06');
    await expect(page.getByText(privateExercise, { exact: true })).toBeVisible();
  });

  test('négy összes sorozat, első bemelegítés és az előző edzésből azonnal megjelenő súlyajánlás', async ({ page }) => {
    test.setTimeout(120000);
    const name = 'E2E bemelegítés és munkasorozatok';
    const exercise = 'E2E típusos fekvenyomás';
    const date = '2021-02-03';
    const increaseMessage = /Emelj.*ha úgy érzed/i;
    const maintainMessage = /megtartanod ezt a súlyt/i;
    const commits = [];
    page.on('request', (request) => { if (request.url().endsWith('/documents:commit')) commits.push(request.postDataJSON()); });
    await page.goto(`${appUrl}#/tervek`);
    await login(page, 0);
    await page.setViewportSize({width:320,height:568});
    await page.getByRole('button', { name: 'Új edzésterv', exact: true }).click();
    await page.getByLabel('Edzésterv neve', { exact: true }).fill(name);
    await page.getByLabel('Gyakorlat neve', { exact: true }).fill(exercise);
    await expect(page.getByLabel('Sorozatok', { exact: true })).toHaveValue('4');
    await expect(page.getByLabel('Bemelegítő sorozatok', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Munkasorozatok', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Ismétléscél', { exact: true })).toHaveValue('10');
    await noOverflow(page);
    expect(await page.getByRole('dialog').evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Edzésterv mentése', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.goto(`${appUrl}#/naplo`);
    await openSession(page, name);
    await page.getByLabel('Edzés dátuma', { exact: true }).fill(date);
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('input[aria-label$="sorozat súlya"]')).toHaveCount(4);
    await expect(dialog.locator('.series-columns')).toHaveCount(1);
    await expect(dialog.locator('.series-row')).toHaveCount(4);
    await expect(dialog.locator('.series-row').first().getByText('Bemelegítő', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Bemelegítő sorozat hozzáadása/i })).toHaveCount(0);
    await expect(dialog.locator('.weight-recommendation')).toHaveCount(0);
    await weight(page, exercise, 1).fill('80');
    await reps(page, exercise, 1).fill('10');
    for (let row = 2; row <= 4; row++) {
      await weight(page, exercise, row).fill('140');
      await reps(page, exercise, row).fill('10');
    }
    await expect(dialog.locator('.weight-recommendation')).toHaveCount(0);
    await noOverflow(page);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const beforeSave = commits.length;
    await saveSession(page);
    expect(commits).toHaveLength(beforeSave + 1);
    const writes = commits.at(-1).writes;
    expect(writes).toHaveLength(5);
    const parent = writes.find((write) => /\/workouts\//.test(write.update?.name));
    expect(parent.update.fields.plannedWorkSets).toEqual({integerValue:'3'});
    expect(parent.update.fields.targetReps).toEqual({integerValue:'10'});
    const rows = writes.filter((write) => /\/workoutSets\//.test(write.update?.name));
    expect(rows.map((write) => write.update.fields.type.stringValue)).toEqual(['warmup','work','work','work']);
    await selectDate(page, date);
    const card = page.locator('.session-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(card.locator('.weight-recommendation')).toHaveCount(0);

    // Advice comes from the completed prior workout as soon as the new modal opens.
    const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'));
    await selectDate(page, today);
    const beforeOpen = commits.length;
    await openSession(page, name);
    await expect(dialog.locator('.series-history')).toContainText('2021. február 3.');
    await expect(dialog.locator('.weight-recommendation')).toContainText(increaseMessage);
    await expect(dialog.locator('.weight-recommendation')).not.toContainText(/\+\s*\d+(?:[,.]\d+)?\s*kg/i);
    await expect(dialog.locator('.weight-recommendation')).not.toContainText(/\b(?:2[,.]5|5)\s*kg/i);
    await expect(dialog.locator('input[aria-label$="sorozat súlya"]')).toHaveCount(4);
    await expect(dialog.locator('.series-columns')).toHaveCount(1);
    await expect(dialog.locator('.series-row')).toHaveCount(4);
    await expect(dialog.locator('.series-row').first().getByText('Bemelegítő', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Bemelegítő sorozat hozzáadása/i })).toHaveCount(0);
    await expect(weight(page, exercise, 1)).toHaveValue('80');
    await expect(reps(page, exercise, 1)).toHaveValue('10');
    for (let row = 2; row <= 4; row++) {
      await expect(weight(page, exercise, row)).toHaveValue('140');
      await expect(reps(page, exercise, row)).toHaveValue('10');
    }
    expect(commits).toHaveLength(beforeOpen);
    const beforeDismiss = commits.length;
    await dialog.getByRole('button', { name: `${exercise} ajánlás elrejtése`, exact: true }).click();
    await expect(dialog.locator('.weight-recommendation')).toHaveCount(0);
    await expect(weight(page, exercise, 1)).toHaveValue('80');
    for (let row = 2; row <= 4; row++) await expect(weight(page, exercise, row)).toHaveValue('140');
    expect(commits).toHaveLength(beforeDismiss);
    await page.getByRole('button', { name: 'Mégse', exact: true }).click();
    expect(commits).toHaveLength(beforeDismiss);

    // The saved session keeps its original types and target when the template changes.
    await page.goto(`${appUrl}#/tervek`);
    await page.getByRole('button', { name: `${name} terv szerkesztése`, exact: true }).click();
    await page.getByLabel('Sorozatok', { exact: true }).fill('3');
    await page.getByLabel('Ismétléscél', { exact: true }).fill('12');
    await page.getByRole('button', { name: 'Módosítások mentése', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.goto(`${appUrl}#/naplo`);
    await page.reload();
    await selectDate(page, date);
    await card.getByRole('button', { name: `${name} edzés szerkesztése`, exact: true }).click();
    await expect(weight(page, exercise, 1)).toHaveValue('80');
    await expect(dialog.locator('input[aria-label$="sorozat súlya"]')).toHaveCount(4);
    await expect(reps(page, exercise, 4)).toHaveValue('10');
    await reps(page, exercise, 2).fill('9');
    await saveSession(page);
    const editedParent = commits.at(-1).writes.find((write) => /\/workouts\//.test(write.update?.name));
    expect(editedParent.update.fields.plannedWorkSets).toEqual({integerValue:'3'});
    expect(editedParent.update.fields.targetReps).toEqual({integerValue:'10'});
    await expect(card.locator('.weight-recommendation')).toHaveCount(0);
    await selectDate(page, today);
    await openSession(page, name);
    await expect(dialog.locator('.series-history')).toContainText('2021. február 3.');
    await expect(dialog.locator('.weight-recommendation')).toContainText(maintainMessage);
    await expect(dialog.locator('.weight-recommendation')).toContainText('12 ismétlés');
    await expect(dialog.getByText(increaseMessage)).toHaveCount(0);
    await noOverflow(page);
    await page.getByRole('button', { name: 'Mégse', exact: true }).click();
    await selectDate(page, date);
    await card.getByRole('button', { name: `${name} edzés szerkesztése`, exact: true }).click();
    await weight(page, exercise, 3).fill('145');
    await saveSession(page);
    await expect(card.locator('.weight-recommendation')).toHaveCount(0);
    await selectDate(page, today);
    await openSession(page, name);
    await expect(dialog.locator('.series-history')).toContainText('2021. február 3.');
    await expect(dialog.getByText(increaseMessage)).toHaveCount(0);
    await page.getByRole('button', { name: 'Mégse', exact: true }).click();
    // Keep the later pagination fixture's exact document budget independent.
    await selectDate(page, date);
    await card.getByRole('button', { name: `${name} teljes edzés törlése`, exact: true }).click();
    await page.getByRole('button', { name: 'Végleges törlés', exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.goto(`${appUrl}#/tervek`);
    await page.getByRole('button', { name: `${name} terv törlése`, exact: true }).click();
    await page.getByRole('button', { name: 'Végleges törlés', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
  });

  test('megszakadt teljes edzésmentés után nincs részleges adat vagy hamis sikerjelzés', async ({ page, request }) => {
    const storedWorkouts = async () => {
      const response = await request.get(`${firestoreUrl}/users/${allowedIds[0]}/workouts`, { headers: { Authorization: 'Bearer owner' } });
      expect(response.ok()).toBe(true);
      return (await response.json()).documents || [];
    };
    const before = await storedWorkouts();
    await page.goto(`${appUrl}#/naplo`);
    await login(page, 0);
    await page.route('**/documents:commit', (route) => route.abort('failed'));
    await openSession(page);
    await page.getByLabel('Edzés dátuma', { exact: true }).fill('2019-05-14');
    const weights = page.getByRole('dialog').locator('input[aria-label$="sorozat súlya"]');
    for (let index = 0; index < await weights.count(); index++) await weights.nth(index).fill('777');
    await page.getByRole('button', { name: 'Edzés mentése', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Ellenőrizd a naplót');
    await expect(page.getByRole('button', { name: 'Edzés mentése', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Mégse', exact: true }).click();
    expect(await storedWorkouts()).toEqual(before);
    await page.unroute('**/documents:commit');
  });

  test('újraindításkor elérhetetlen jogosultságszerver nem mutat korábbi privát adatot', async ({ page }) => {
    await page.goto(`${appUrl}#/tervek`);
    await login(page, 0);
    await expect(page.getByRole('heading', { name: planName, exact: true })).toBeVisible();
    await page.route('http://127.0.0.1:8080/**', (route) => route.abort('failed'));
    await page.route('**/v1/projects/**', (route) => route.abort('failed'));
    await page.route('**/google.firestore.v1.Firestore/**', (route) => route.abort('failed'));
    await page.reload();
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByText(planName, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Készen állsz a következőre?' })).toBeVisible({timeout:30000});
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('a szerveren visszavont engedély bezárja a már megnyitott privát felületet', async ({ page, request }) => {
    await page.goto(appUrl);
    await login(page, 0);
    const endpoint = `${firestoreUrl}/access/allowedUsers`;
    try {
      expect((await request.delete(endpoint, { headers: { Authorization: 'Bearer owner' } })).ok()).toBe(true);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByRole('heading', { name: 'Készen állsz a következőre?' })).toBeVisible();
      await expect(page.getByRole('navigation')).toHaveCount(0);
    } finally {
      expect((await request.patch(endpoint, { headers: { Authorization: 'Bearer owner' }, data: { fields: { uids: { arrayValue: { values: allowedIds.map((id) => ({stringValue:id})) } } } } })).ok()).toBe(true);
    }
  });

  test('száz újabb bejegyzést tölt, régi előzményt célzottan keres és lapoz', async ({ page, request }) => {
    test.setTimeout(120000);
    const root = `projects/demo-eronaplo/databases/(default)/documents/users/${allowedIds[0]}`;
    const oldExercise = 'E2E nagyon régi gyakorlat';
    const oldPlan = 'E2E régi előzmény terve';
    const field = (value) => typeof value === 'string' ? {stringValue:value} : typeof value === 'boolean' ? {booleanValue:value} : {integerValue:String(value)};
    const writes = [{ update: { name: `${root}/plans/budget-plan`, fields: {
      name: field(oldPlan), exercises: field(JSON.stringify({version:1,items:[{id:'old-item',name:oldExercise,sets:4,reps:10}]})),
      createdAt: {timestampValue:'2021-02-01T12:00:00Z'}, updatedAt: {timestampValue:'2021-02-01T12:00:00Z'},
    } } }];
    for (let i=0;i<101;i++) {
      const id = i<100 ? `budget-${String(i).padStart(3,'0')}` : 'budget-old';
      const values = {exercise:i<100 ? `Budget ${i}` : oldExercise,date:i<100?'2021-02-01':'2020-01-01',notes:'',status:'completed',setCount:i<100?1:4};
      writes.push({update:{name:`${root}/workouts/${id}`,fields:{...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,field(v)])),createdAt:{timestampValue:'2021-02-01T12:00:00Z'},updatedAt:{timestampValue:'2021-02-01T12:00:00Z'}}}});
      for(let index=0;index<values.setCount;index++) writes.push({update:{name:`${root}/workoutSets/${id}_${index}`,fields:Object.fromEntries(Object.entries({workoutId:id,index,weight:i<100?20:55+index*10,reps:10,completed:true}).map(([k,v])=>[k,field(v)]))}});
    }
    expect((await request.post(`${firestoreUrl}:commit`, { headers: {Authorization:'Bearer owner'},data:{writes} })).ok()).toBe(true);
    await page.goto(`${appUrl}#/naplo`);
    await login(page, 0);
    await expect(page.locator('.history-budget')).toContainText('100 betöltött');
    await expect(page.getByText(oldExercise, { exact: true })).toHaveCount(0);
    const cachedSets = () => page.evaluate(async (uid) => {
      const {db} = await import('/src/lib/firebase.js');
      const moduleSource = await (await fetch('/src/lib/firebase.js')).text();
      const sdkUrl = moduleSource.match(/from\s+["']([^"']*firebase_firestore[^"']*)["']/)[1];
      const {getDocsFromCache,collection} = await import(sdkUrl);
      return (await getDocsFromCache(collection(db,'users',uid,'workoutSets'))).size;
    }, allowedIds[0]);
    expect(await cachedSets()).toBe(100);
    await openSession(page, oldPlan);
    await expect(page.locator('.series-history')).toContainText('2020. január 1.');
    await expect(weight(page, oldExercise, 1)).toHaveValue('55');
    await expect(weight(page, oldExercise, 4)).toHaveValue('85');
    expect(await cachedSets()).toBeLessThanOrEqual(104);
    await page.getByRole('button', { name: 'Mégse', exact: true }).click();
    await page.getByRole('button', { name: 'Régebbi edzések betöltése', exact: true }).click();
    await selectDate(page, '2020-01-01');
    await expect(page.getByText(oldExercise, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Régebbi edzések betöltése', exact: true })).toHaveCount(0);
  });
});
