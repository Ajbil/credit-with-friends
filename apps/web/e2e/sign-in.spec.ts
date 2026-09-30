import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

test('done-when-2: an unlisted person sees Not open yet and a pending person can remove sign-in', async ({ page }) => {
  await page.goto('/?returnTo=/circles/join/example');
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', /returnTo=%2Fcircles%2Fjoin%2Fexample/);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'CreditWithFriends home' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeFocused();

  const refused = await page.request.post('http://localhost:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: 'web-unlisted', email: 'unlisted@example.in', name: 'Outsider' },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  });
  expect(refused.status()).toBe(403);
  await page.goto('/not-open-yet');
  await expect(page.getByRole('heading', { name: 'Not open yet' })).toBeVisible();

  const admitted = await page.request.post('http://localhost:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: 'web-pending-cancel', email: 'listed@example.in', name: 'Listed Person', returnPath: '/circles/join/example' },
    headers: { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' },
  });
  expect(admitted.ok()).toBeTruthy();
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Finish your account' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel and remove my sign-in' }).click();
  await expect(page.getByRole('link', { name: 'Continue with Google' })).toBeVisible();
  const pending = await page.request.get('http://localhost:3104/api/v1/sign-ins');
  expect(pending.status()).toBe(401);
  const db = new PrismaClient({ datasources: { db: { url: process.env.CWF_WEB_TEST_DATABASE_URL } } });
  try {
    expect(await db.pendingSignIn.count({ where: { googleAccountId: 'web-pending-cancel' } })).toBe(0);
  } finally {
    await db.$disconnect();
  }
});
