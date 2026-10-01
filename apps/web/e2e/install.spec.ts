import { expect, test } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const origin = 'http://127.0.0.1:5174';
const webRoot = fileURLToPath(new URL('../', import.meta.url));
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
let preview: ChildProcess;

test.beforeAll(async () => {
  execFileSync(process.execPath, [vite, 'build'], { cwd: webRoot, env: { ...process.env, VITE_API_ORIGIN: 'http://localhost:3104' } });
  preview = spawn(process.execPath, [vite, 'preview', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: webRoot });
  await expect.poll(async () => {
    try { return (await fetch(origin)).ok; } catch { return false; }
  }).toBeTruthy();
});

test.afterAll(() => preview?.kill());

test('done-when-3: the app installs with an offline shell and does not cache member data', async ({ page }) => {
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
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Find the card. Ask a friend.' })).toBeVisible();
  await page.context().setOffline(false);
  const cacheKeys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map((key) => caches.open(key).then((cache) => cache.keys())))).flat().map((request) => request.url));
  expect(cacheKeys.some((url) => url.includes('/api/v1/'))).toBe(false);
});
