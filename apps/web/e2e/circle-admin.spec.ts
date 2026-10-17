import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';

const api = 'http://localhost:3104/api/v1';
const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };

async function member(context: BrowserContext, displayName: string) {
  const signedIn = await context.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: displayName }, headers,
  });
  expect(signedIn.ok()).toBeTruthy();
  const session = signedIn.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await context.addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  expect((await context.request.post(`${api}/onboarding`, {
    data: { displayName, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers,
  })).ok()).toBeTruthy();
}

async function circle(context: BrowserContext, name: string) {
  const response = await context.request.post(`${api}/circles`, { data: { name }, headers });
  expect(response.status()).toBe(201);
  return (await response.json()).data.id as string;
}

test('done-when-4: rename validates like creation and updates the circle screen and the cached circles list', async ({ page }) => {
  await member(page.context(), 'Asha Admin');
  await circle(page.context(), 'Family');
  await page.goto('/');
  await page.getByRole('link', { name: /^Family/ }).click();
  const settings = page.getByRole('region', { name: 'Circle settings' });
  const name = settings.getByRole('textbox', { name: 'Circle name', exact: true });
  const rename = settings.getByRole('button', { name: 'Rename circle', exact: true });
  let writes = 0;
  page.on('request', (request) => { if (request.method() === 'PATCH') writes++; });
  for (const invalid of ['   ', 'a'.repeat(41)]) {
    await name.fill(invalid);
    await rename.focus();
    await page.keyboard.press('Enter');
    await expect(settings.getByRole('alert')).toHaveText('Use 1 to 40 characters.');
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(writes).toBe(0);
  }
  await page.screenshot({ path: test.info().outputPath('rename-validation-phone.png'), fullPage: true });
  await expect(page.getByRole('textbox', { name: 'Invite link', exact: true })).toBeVisible();
  await name.fill('  College friends  ');
  await page.context().setOffline(true);
  await rename.tap();
  await expect(settings.getByRole('alert')).toContainText('Check your connection and try again.');
  await expect(name).toHaveValue('  College friends  ');
  await page.screenshot({ path: test.info().outputPath('rename-recovery-phone.png'), fullPage: true });
  await page.context().setOffline(false);
  await rename.click();
  await expect(page.getByRole('heading', { name: 'College friends', exact: true })).toBeVisible();
  await expect(settings.getByRole('status')).toContainText('Circle renamed.');
  await page.screenshot({ path: test.info().outputPath('rename-success-phone.png'), fullPage: true });
  await page.getByRole('link', { name: 'Back to your circles' }).click();
  await expect(page.getByRole('link', { name: /^College friends/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Family/ })).toHaveCount(0);
});

test('done-when-4 and done-when-6: cancelling keeps the admin; confirming moves circle settings to the named member', async ({ page, browser }) => {
  const nextAdmin = await browser.newContext();
  try {
    await member(page.context(), 'Asha Admin');
    const id = await circle(page.context(), 'College batch');
    const invite = (await (await page.request.get(`${api}/circles/${id}/invite`)).json()).data.url as string;
    await member(nextAdmin, 'Dev Member');
    const view = await nextAdmin.newPage();
    await view.goto(new URL(invite).pathname);
    await view.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Leave circle', exact: true })).toBeVisible();
    const adminControls = (screen: typeof page) => [
      screen.getByRole('textbox', { name: 'Invite link', exact: true }),
      screen.getByRole('button', { name: 'Copy', exact: true }),
      screen.getByRole('link', { name: 'Share on WhatsApp', exact: true }),
      screen.getByRole('button', { name: 'Reset link', exact: true }),
      screen.getByRole('button', { name: 'Rename circle', exact: true }),
      screen.getByRole('combobox', { name: 'New admin', exact: true }),
      screen.getByRole('button', { name: 'Hand over admin role', exact: true }),
      screen.getByRole('button', { name: 'Delete circle', exact: true }),
    ];
    for (const control of adminControls(view)) await expect(control).toHaveCount(0);
    await expect(view.getByRole('button', { name: /Remove/ })).toHaveCount(0);
    await expect(view.getByRole('button', { name: 'Clear all removals', exact: true })).toHaveCount(0);
    await page.goto(`/circles/${id}`);
    const select = page.getByRole('combobox', { name: 'New admin', exact: true });
    await expect(select.getByRole('option', { name: 'Asha Admin', exact: true })).toHaveCount(0);
    await select.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(select).toHaveValue((await (await nextAdmin.request.get(`${api}/members/me`)).json()).data.id);
    const handover = page.getByRole('button', { name: 'Hand over admin role', exact: true });
    let writes = 0;
    page.on('request', (request) => { if (request.url().endsWith('/handover')) writes++; });
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Dev Member');
      expect(writes).toBe(0);
      await dialog.dismiss();
    });
    await handover.focus();
    await page.keyboard.press('Enter');
    await expect(handover).toBeFocused();
    await expect(page.getByRole('listitem').filter({ hasText: 'Asha Admin' }).getByText('Admin', { exact: true })).toBeVisible();
    expect(writes).toBe(0);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole('textbox', { name: 'Circle name', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Rename circle', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(select).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(handover).toBeFocused();
      await page.screenshot({ path: test.info().outputPath(`settings-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Delete circle', exact: true })).toBeFocused();
      const settings = page.getByRole('region', { name: 'Circle settings' });
      for (const control of await settings.locator('input, select, button').all()) {
        const bounds = await control.boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
      }
      await test.info().attach(`settings-${width}-styles`, {
        contentType: 'application/json',
        body: JSON.stringify(await settings.evaluate((region) => ({
          surface: getComputedStyle(region).backgroundColor,
          text: getComputedStyle(region).color,
          controls: Array.from(region.querySelectorAll('input, select, button')).map((element) => {
            const style = getComputedStyle(element);
            return { label: element.getAttribute('id') || element.textContent, color: style.color, background: style.backgroundColor, fontSize: style.fontSize, transition: style.transition, transform: style.transform };
          }),
        }))),
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    page.once('dialog', (dialog) => dialog.accept());
    await handover.tap();
    await expect(page.getByRole('listitem').filter({ hasText: 'Dev Member' }).getByText('Admin', { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    for (const control of adminControls(page)) await expect(control).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Remove/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Clear all removals', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Leave circle', exact: true })).toBeVisible();
    await view.reload();
    for (const control of adminControls(view)) await expect(control).toBeVisible();
  } finally { await nextAdmin.close(); }
});

test('done-when-5: deletion warns it is permanent, cancellation keeps the circle and confirmation returns to a list without it', async ({ page }) => {
  await member(page.context(), 'Asha Admin');
  const id = await circle(page.context(), 'Throwaway circle');
  await circle(page.context(), 'Family');
  // Load the list before deletion so success must retire a cached membership.
  await page.goto('/');
  await page.getByRole('link', { name: /^Throwaway circle/ }).click();
  const remove = page.getByRole('button', { name: 'Delete circle', exact: true });
  let writes = 0;
  page.on('request', (request) => { if (request.method() === 'DELETE' && request.url() === `${api}/circles/${id}`) writes++; });
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Throwaway circle');
    expect(dialog.message()).toMatch(/permanent.*cannot be undone/i);
    expect(writes).toBe(0);
    await dialog.dismiss();
  });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(remove).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Throwaway circle', exact: true })).toBeVisible();
  expect(writes).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await remove.tap();
  await expect(page.getByRole('heading', { name: 'Your circles', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Throwaway circle/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Family/ })).toBeVisible();
  expect(writes).toBe(1);
});
