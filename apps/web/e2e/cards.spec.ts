import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('done-when-1: your cards works without a circle, explains an empty list and retries a failed load', async ({ page }) => {
  const api = 'http://localhost:3104/api/v1';
  const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };
  const signIn = await page.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: 'Card Holder' }, headers,
  });
  expect(signIn.ok()).toBeTruthy();
  const session = signIn.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await page.context().addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  expect((await page.request.post(`${api}/onboarding`, {
    data: { displayName: 'Card Holder', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers,
  })).ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByText('No circles yet')).toBeVisible();
  const cardsLink = page.getByRole('link', { name: 'Your cards', exact: true });
  await page.getByRole('link', { name: 'CreditWithFriends home' }).focus();
  await page.keyboard.press('Tab');
  await expect(cardsLink).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('cards-home-mobile.png'), fullPage: true });
  const mobileViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('cards-home-desktop.png'), fullPage: true });
  await page.setViewportSize(mobileViewport);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/cards');
  await expect(page.getByRole('heading', { name: 'Your cards', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Your cards | CreditWithFriends');
  await expect(page.getByRole('heading', { name: 'No cards yet' })).toBeVisible();
  await expect(page.getByText(/even if you haven’t joined a circle/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('cards-empty-mobile.png'), fullPage: true });
  await page.getByRole('link', { name: 'Back to your circles' }).click();

  // T4A owns the list. Create through the running API until the add screen arrives in T4E.
  for (const card of [
    { bankId: 'hdfc-bank', type: 'credit', variant: 'Millennia' },
    { bankId: 'federal-bank', type: 'debit' },
  ]) expect((await page.request.post(`${api}/me/cards`, { data: card, headers })).status()).toBe(201);

  // A real connection failure exercises recovery without replacing the cards API.
  await page.context().setOffline(true);
  await cardsLink.click();
  await expect(page.getByRole('alert')).toContainText('We couldn’t load your cards');
  await expect(page.getByText('Check your connection and try again.')).toBeVisible();
  await expect(page.getByText('No cards yet')).toHaveCount(0);
  const retry = page.getByRole('button', { name: 'Try again' });
  await page.getByRole('link', { name: 'Back to your circles' }).focus();
  await page.keyboard.press('Tab');
  await expect(retry).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('cards-error-mobile.png'), fullPage: true });
  await page.context().setOffline(false);
  await page.keyboard.press('Enter');
  const list = page.getByRole('list', { name: 'Your cards' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  const credit = list.getByRole('listitem').filter({ hasText: 'HDFC Bank' });
  await expect(credit).toContainText('Credit card');
  await expect(credit).toContainText('Millennia');
  await expect(list.getByRole('listitem').filter({ hasText: 'Federal Bank' })).toContainText('Debit card');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('cards-list-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('cards-list-desktop.png'), fullPage: true });
  await page.reload();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('link', { name: 'Back to your circles' }).click();
  await expect(page.getByText('No circles yet')).toBeVisible();
});
