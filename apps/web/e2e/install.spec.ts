import { expect, test } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const origin = 'http://localhost:5174';
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
let preview: ChildProcess;

test.beforeAll(async () => {
  execFileSync(process.execPath, [vite, 'build'], { cwd: webRoot, env: { ...process.env, VITE_API_ORIGIN: 'http://localhost:3104' } });
  preview = spawn(process.execPath, [vite, 'preview', '--host', 'localhost', '--port', '5174', '--strictPort'], { cwd: webRoot });
  await expect.poll(async () => {
    try { return (await fetch(origin)).ok; } catch { return false; }
  }).toBeTruthy();
});

test.afterAll(() => preview?.kill());

test('done-when-3: the app installs with an offline shell and does not cache member data', async ({ page }) => {
  const api = 'http://localhost:3104/api/v1';
  const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };
  expect((await page.request.post(`${api}/test-auth/sign-in`, {
    data: { googleAccountId: 'web-install', email: 'listed@example.in', name: 'Install Member' }, headers,
  })).ok()).toBeTruthy();
  expect((await page.request.post(`${api}/onboarding`, {
    data: { displayName: 'Install Member', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers,
  })).ok()).toBeTruthy();
  const memberResponse = await page.request.get(`${api}/members/me`);
  expect(memberResponse.ok()).toBeTruthy();
  const memberBody = await memberResponse.text();
  expect(memberBody).toContain('web-install');
  await page.goto(origin);
  const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toBeTruthy();
  const response = await page.request.get(new URL(manifest!, origin).toString());
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data).toMatchObject({ name: 'CreditWithFriends', display: 'standalone', start_url: '/' });
  expect(data.icons.length).toBeGreaterThan(0);
  const cdp = await page.context().newCDPSession(page);
  expect((await cdp.send('Page.getInstallabilityErrors')).installabilityErrors).toEqual([]);
  await expect.poll(async () => page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)).toBeTruthy();
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // The preview uses a second local port; bridge its CORS headers while keeping the real API response.
  await page.route(`${api}/members/me`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'cross-origin-resource-policy': 'cross-origin' } });
  });
  const requested = page.waitForRequest(`${api}/members/me`);
  const browserBody = await page.evaluate(async (url) => (await (await fetch(url, { credentials: 'include' })).text()), `${api}/members/me`);
  expect((await requested).url()).toBe(`${api}/members/me`);
  expect(browserBody).toContain('web-install');
  const cached = await page.evaluate(async () => Promise.all((await caches.keys()).map(async (key) => {
    const cache = await caches.open(key);
    return Promise.all((await cache.keys()).map(async (request) => ({ url: request.url, body: await (await cache.match(request))!.text() })));
  })).then((groups) => groups.flat()));
  expect(cached.some(({ url }) => url.includes('/api/v1/'))).toBe(false);
  expect(cached.some(({ body }) => body.includes('web-install') || body.includes(memberBody))).toBe(false);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: 'CreditWithFriends home', exact: true })).toBeVisible();
  await page.context().setOffline(false);
});
