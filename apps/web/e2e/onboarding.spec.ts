import { expect, test } from '@playwright/test';

test('done-when-1: onboarding waits for an approved notice and protects member data', async ({ page }) => {
  const admitted = await page.request.post('http://localhost:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: 'web-pending-notice', email: 'listed@example.in', name: 'Listed Person' },
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
});
