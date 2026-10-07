import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('done-when-1: a member creates named circles, sees all of them and is told about the limit', async ({ page }) => {
  test.setTimeout(60_000);
  const api = 'http://localhost:3104/api/v1';
  const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };
  const signIn = await page.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: 'Circle Creator' }, headers,
  });
  expect(signIn.ok()).toBeTruthy();
  const session = signIn.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await page.context().addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  expect((await page.request.post(`${api}/onboarding`, {
    data: { displayName: 'Circle Creator', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers,
  })).ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your circles', exact: true })).toBeVisible();
  await expect(page.getByText('No circles yet')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mobile-empty.png'), fullPage: true });
  await page.getByRole('link', { name: 'Your profile' }).focus();
  await page.keyboard.press('Tab');
  const name = page.getByRole('textbox', { name: 'Circle name' });
  await expect(name).toBeFocused();
  await page.getByRole('button', { name: 'Create circle', exact: true }).click();
  await expect(page.getByText('Use 1 to 40 characters.', { exact: true })).toBeVisible();
  await expect(name).toBeFocused();
  await name.fill('x'.repeat(41));
  await page.getByRole('button', { name: 'Create circle', exact: true }).click();
  await expect(page.getByText('Use 1 to 40 characters.', { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('mobile-validation.png'), fullPage: true });
  expect((await (await page.request.get(`${api}/circles`)).json()).data.items).toEqual([]);

  await name.fill('  College batch  ');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Create circle', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Your circle is created.');
  const first = page.getByRole('link', { name: 'College batch 1 member · You’re the admin' });
  await expect(first).toBeVisible();
  const circles = (await (await page.request.get(`${api}/circles`)).json()).data.items;
  expect(circles).toHaveLength(1);
  expect(circles[0]).toMatchObject({ name: 'College batch', memberCount: 1, isAdmin: true });
  await expect(first).toHaveAttribute('href', `/circles/${circles[0].id}`);

  // The UI must count user-perceived characters, just like the API, rather than UTF-16 units.
  const unicodeName = '😀'.repeat(40);
  await name.fill(unicodeName);
  await page.getByRole('button', { name: 'Create circle', exact: true }).click();
  await expect(page.getByRole('link', { name: `${unicodeName} 1 member · You’re the admin` })).toBeVisible();
  await page.reload();
  await expect(first).toBeVisible();
  await expect(page.getByRole('link', { name: `${unicodeName} 1 member · You’re the admin` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await first.click();
  await expect(page.getByRole('heading', { name: 'Circle', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to your circles' }).click();
  await page.getByRole('link', { name: 'Your profile' }).click();
  await expect(page.getByRole('heading', { name: 'Your profile', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to home' }).click();

  await name.fill('Family');
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Create circle', exact: true }).click();
  await expect(page.getByText('We couldn’t create your circle. Please try again.')).toBeVisible();
  await expect(name).toHaveValue('Family');
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'Create circle', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Family 1 member · You’re the admin', exact: true })).toBeVisible();

  for (let index = 4; index <= 20; index++) {
    expect((await page.request.post(`${api}/circles`, { data: { name: `Family ${index}` }, headers })).ok()).toBeTruthy();
  }
  // Create from the stale screen too: the API's limit message must survive the form boundary.
  await name.fill('One too many');
  await page.getByRole('button', { name: 'Create circle', exact: true }).click();
  await expect(page.getByText('You can belong to at most 20 circles.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Your circles' }).getByRole('link')).toHaveCount(20);
  await expect(first).toBeVisible();
  await expect(page.getByRole('link', { name: 'Family 20 1 member · You’re the admin' })).toBeVisible();
});
