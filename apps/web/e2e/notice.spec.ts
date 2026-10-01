import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('done-when-3: a material notice requires fresh agreement before profile access', async ({ page }) => {
  const api = 'http://localhost:3104/api/v1';
  expect((await page.request.post(`${api}/test-auth/sign-in`, {
    data: { googleAccountId: 'web-notice', email: 'listed@example.in', name: 'Notice Member' },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  })).ok()).toBeTruthy();
  expect((await page.request.post(`${api}/onboarding`, {
    data: { displayName: 'Notice Member', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  })).ok()).toBeTruthy();
  // Publication has no client API; this creates the externally approved version at its persistence edge.
  const db = new PrismaClient({ datasources: { db: { url: process.env.CWF_WEB_TEST_DATABASE_URL } } });
  try {
    await db.privacyNoticeVersion.create({ data: { version: 2, text: 'We now use your data for a new purpose. Contact owner@example.in.', isMaterialChange: true, publishedAtUtc: new Date() } });
    expect((await page.request.get(`${api}/members/me`)).status()).toBe(403);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Review the privacy notice' })).toBeVisible();
    await expect(page.getByText('We now use your data for a new purpose. Contact owner@example.in.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept and continue' })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('/notice?returnTo=%2F%5Cattacker.example');
    await expect(page.getByRole('heading', { name: 'Review the privacy notice' })).toBeVisible();
    await page.getByLabel('I agree to the privacy notice.').focus();
    await expect(page.getByLabel('I agree to the privacy notice.')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByLabel('I agree to the privacy notice.')).toBeChecked();
    const acceptedAfter = new Date();
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/profile');
    expect((await page.request.get(`${api}/members/me`)).ok()).toBeTruthy();
    const consent = await db.consent.findFirstOrThrow({
      where: { member: { googleAccountId: 'web-notice' }, privacyNoticeVersion: { version: 2 } },
      select: { acceptedAtUtc: true, privacyNoticeVersion: { select: { version: true } } },
    });
    expect(consent.privacyNoticeVersion.version).toBe(2);
    expect(consent.acceptedAtUtc).toBeInstanceOf(Date);
    expect(consent.acceptedAtUtc.getTime()).toBeGreaterThanOrEqual(acceptedAfter.getTime());
    expect(consent.acceptedAtUtc.getTime()).toBeLessThanOrEqual(Date.now());
  } finally {
    await db.consent.deleteMany({ where: { privacyNoticeVersion: { version: 2 } } });
    await db.privacyNoticeVersion.deleteMany({ where: { version: 2 } });
    await db.$disconnect();
  }
});
