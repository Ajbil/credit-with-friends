import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('a signed-in member reaches their profile, returns home, and signs out on a phone', async ({ page }) => {
  const api = 'http://localhost:3104/api/v1';
  const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };
  // Use IPv4 for setup so this test does not share the other browser tests' sign-in rate limit.
  const signIn = await page.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: 'Phone Member' },
    headers,
  });
  expect(signIn.ok()).toBeTruthy();
  const session = signIn.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await page.context().addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  expect((await page.request.post(`${api}/onboarding`, {
    data: { displayName: 'Phone Member', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 },
    headers,
  })).ok()).toBeTruthy();

  await page.goto('/');
  const profile = page.getByRole('link', { name: 'Your profile' });
  // The signed-in home now lists circles; the profile round trip stays available.
  await expect(page.getByRole('heading', { name: 'Your circles', exact: true })).toBeVisible();
  await expect(profile).toBeVisible();
  await profile.focus();
  await expect(profile).toBeFocused();
  expect((await profile.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await profile.tap();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await expect(page.getByText('listed@example.in')).toBeVisible();

  await page.getByRole('link', { name: 'Back to home' }).tap();
  await expect(page.getByRole('heading', { name: 'Your circles', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Your profile' }).tap();
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out of this device' }).tap();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
});
