import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('done-when-1: onboarding creates a member only after explicit consent', async ({ page }) => {
  const admitted = await page.request.post('http://localhost:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: 'web-pending-notice', email: 'listed@example.in', name: 'Listed Person', returnPath: '/circles/join/example' },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  });
  expect(admitted.ok()).toBeTruthy();
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Finish your account' })).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('Listed Person');
  await expect(page.getByRole('button', { name: 'Create my account' })).toBeDisabled();
  await expect(page.getByText('The privacy notice is not available yet. Please try again later.')).toBeVisible();
  const member = await page.request.get('http://localhost:3104/api/v1/members/me');
  expect(member.status()).toBe(403);

  const db = new PrismaClient({ datasources: { db: { url: process.env.CWF_WEB_TEST_DATABASE_URL } } });
  try {
    await db.privacyNoticeVersion.create({ data: { version: 1, text: 'Test privacy notice for browser onboarding.', isMaterialChange: true, publishedAtUtc: new Date() } });
  } finally {
    await db.$disconnect();
  }
  await page.reload();
  await expect(page.getByText('Test privacy notice for browser onboarding.')).toBeVisible();
  const name = page.getByLabel('Name');
  const phone = page.getByLabel('WhatsApp number');
  await name.fill('');
  await phone.fill('+447911123456');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByText('Use 1 to 50 characters.')).toBeVisible();
  expect((await page.request.get('http://localhost:3104/api/v1/members/me')).status()).toBe(403);
  await name.fill('x'.repeat(51));
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByText('Use 1 to 50 characters.')).toBeVisible();
  expect((await page.request.get('http://localhost:3104/api/v1/members/me')).status()).toBe(403);
  await name.fill('  Listed Person  ');
  await phone.fill('12');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByText('Enter a valid phone number with a country code.')).toBeVisible();
  expect((await page.request.get('http://localhost:3104/api/v1/members/me')).status()).toBe(403);
  await phone.fill('+447911123456');
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page.getByText('Confirm you are 18 or older.')).toBeVisible();
  await expect(page.getByText('Accept the privacy notice to continue.')).toBeVisible();
  await page.getByLabel('I confirm I am 18 or older.').check();
  const consent = page.getByLabel('I agree to the privacy notice.');
  await consent.focus();
  await page.keyboard.press('Space');
  await expect(consent).toBeChecked();
  await page.getByRole('button', { name: 'Create my account' }).click();
  await expect(page).toHaveURL(/\/circles\/join\/example$/);
  await expect(page.getByText('Your account is ready.')).toBeVisible();
  const profile = await page.request.get('http://localhost:3104/api/v1/members/me');
  expect(profile.ok()).toBeTruthy();
  expect((await profile.json()).data).toMatchObject({ displayName: 'Listed Person', whatsappE164: '+447911123456' });
});
