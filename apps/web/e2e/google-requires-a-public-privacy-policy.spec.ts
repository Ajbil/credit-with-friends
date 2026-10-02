import { expect, test } from '@playwright/test';

test('anyone can open the privacy page without signing in and read the current notice', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy notice' })).toBeVisible();
  await expect(page.getByText('any backup copy we make by hand is kept for at least 7 days', { exact: false })).toBeVisible();
  await expect(page.getByText('contact us at owner@example.in', { exact: false })).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);
});
