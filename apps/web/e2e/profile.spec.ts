import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

test('done-when-3: a member edits a private profile and signs out of this device', async ({ page, browser }) => {
  const api = 'http://localhost:3104/api/v1';
  const signIn = async (request: APIRequestContext, account: string, email = 'listed@example.in') => request.post(`${api}/test-auth/sign-in`, {
    data: { googleAccountId: account, email, name: 'Initial Name' },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  });
  expect((await signIn(page.request, 'web-profile')).ok()).toBeTruthy();
  expect((await page.request.post(`${api}/onboarding`, {
    data: { displayName: 'Initial Name', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  })).ok()).toBeTruthy();
  const other = await browser.newContext();
  const stranger = await browser.newContext();
  const db = new PrismaClient({ datasources: { db: { url: process.env.CWF_WEB_TEST_DATABASE_URL } } });
  try {
    expect((await signIn(other.request, 'web-profile')).ok()).toBeTruthy();
    expect((await signIn(stranger.request, 'web-stranger')).ok()).toBeTruthy();
    expect((await stranger.request.post(`${api}/onboarding`, {
      data: { displayName: 'Other Member', whatsappNumber: '9876543211', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 },
      headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
    })).ok()).toBeTruthy();
    expect((await signIn(stranger.request, 'web-stranger', 'other@example.in')).ok()).toBeTruthy();
    const strangerResponse = await stranger.request.get(`${api}/members/me`);
    expect(strangerResponse.ok()).toBeTruthy();
    const strangerBody = await strangerResponse.text();
    expect(strangerBody).not.toContain('listed@example.in');
    expect(strangerBody).not.toContain('web-profile');
    const strangerPage = await stranger.newPage();
    await strangerPage.goto('http://localhost:5173/profile');
    await expect(strangerPage.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    await expect(strangerPage.getByText('other@example.in')).toBeVisible();
    expect(await strangerPage.locator('body').innerText()).not.toContain('listed@example.in');
    expect(await strangerPage.locator('body').innerText()).not.toContain('web-profile');
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
    const cookie = (await page.context().cookies(api)).find(({ name }) => name === 'cwf_session');
    expect(cookie).toBeDefined();
    await db.session.update({ where: { tokenHash: createHash('sha256').update(cookie!.value).digest('hex') }, data: { expiresAtUtc: new Date(0) } });
    await page.getByRole('button', { name: 'Sign out of this device' }).click();
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByText('listed@example.in')).toHaveCount(0);
    await expect(page.getByText('web-profile')).toHaveCount(0);
    expect((await page.request.get(`${api}/members/me`)).status()).toBe(401);
    expect((await other.request.get(`${api}/members/me`)).ok()).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Your sign-in has ended' })).toBeVisible();
    await page.getByRole('link', { name: 'Continue with Google' }).focus();
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeFocused();
    expect((await signIn(page.request, 'web-profile')).ok()).toBeTruthy();
    await page.goto('/profile');
    await expect(page.getByLabel('Name')).toHaveValue('Changed Name');
    await expect(page.getByLabel('WhatsApp number')).toHaveValue('+447911123456');
    await page.getByRole('button', { name: 'Sign out of this device' }).click();
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
    expect((await other.request.get(`${api}/members/me`)).ok()).toBeTruthy();
  } finally { await db.$disconnect(); await other.close(); await stranger.close(); }
});
