import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

test('done-when-3: a member edits a private profile and signs out of this device', async ({ page, browser }) => {
  const api = 'http://localhost:3104/api/v1';
  const signIn = async (request: APIRequestContext, account: string) => request.post(`${api}/test-auth/sign-in`, {
    data: { googleAccountId: account, email: 'listed@example.in', name: 'Initial Name' },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  });
  expect((await signIn(page.request, 'web-profile')).ok()).toBeTruthy();
  expect((await page.request.post(`${api}/onboarding`, {
    data: { displayName: 'Initial Name', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  })).ok()).toBeTruthy();
  const other = await browser.newContext();
  try {
    expect((await signIn(other.request, 'web-profile')).ok()).toBeTruthy();
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    await expect(page.getByText('listed@example.in')).toBeVisible();
    await expect(page.getByText('web-profile')).toBeVisible();
    await page.getByLabel('Name').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('WhatsApp number')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel('Name').fill('');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Use 1 to 50 characters.')).toBeVisible();
    expect((await (await other.request.get(`${api}/members/me`)).json()).data.displayName).toBe('Initial Name');
    await page.getByLabel('Name').fill('Changed Name');
    await page.getByLabel('WhatsApp number').fill('+447911123456');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status')).toContainText('saved');
    expect((await (await other.request.get(`${api}/members/me`)).json()).data).toMatchObject({ displayName: 'Changed Name', whatsappE164: '+447911123456' });
    await page.getByRole('button', { name: 'Sign out of this device' }).click();
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
    expect((await page.request.get(`${api}/members/me`)).status()).toBe(401);
    expect((await other.request.get(`${api}/members/me`)).ok()).toBeTruthy();
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Your sign-in has ended' })).toBeVisible();
    expect((await signIn(page.request, 'web-profile')).ok()).toBeTruthy();
    await page.goto('/profile');
    await expect(page.getByLabel('Name')).toHaveValue('Changed Name');
  } finally { await other.close(); }
});
