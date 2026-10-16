import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const api = 'http://localhost:3104/api/v1';
const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };
const blockedMessage = "You can't join this circle.";

async function member(context: BrowserContext, displayName: string) {
  const response = await context.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: displayName }, headers,
  });
  expect(response.ok()).toBeTruthy();
  const session = response.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await context.addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  const onboard = await context.request.post(`${api}/onboarding`, {
    data: { displayName, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers,
  });
  expect(onboard.ok()).toBeTruthy();
}

async function circle(context: BrowserContext) {
  const response = await context.request.post(`${api}/circles`, { data: { name: 'Trusted friends' }, headers });
  expect(response.status()).toBe(201);
  const id: string = (await response.json()).data.id;
  const invite = await context.request.get(`${api}/circles/${id}/invite`);
  expect(invite.ok()).toBeTruthy();
  return { id, path: new URL((await invite.json()).data.url).pathname };
}

async function blocked(page: Page) {
  await expect(page.getByRole('alert')).toHaveText(blockedMessage);
  await expect(page.getByText(/Trusted friends|Asha Admin|Dev Member|\d+ members?/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
}

test('done-when-3: remove after confirmation, hide blocked invites before and at Join, and clear only allows an explicit rejoin', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const admin = await browser.newContext();
  try {
    await member(admin, 'Asha Admin');
    await member(page.context(), 'Dev Member');
    const { id, path } = await circle(admin);
    await page.goto(path);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Trusted friends', exact: true })).toBeVisible();

    const adminPage = await admin.newPage();
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto(`/circles/${id}`);
    const removedRow = adminPage.getByRole('listitem').filter({ hasText: 'Dev Member' });
    const remove = removedRow.getByRole('button', { name: 'Remove Dev Member' });
    let removes = 0;
    let clears = 0;
    adminPage.on('request', (request) => {
      if (request.url().endsWith('/remove')) removes++;
      if (request.url().endsWith('/removals/clear')) clears++;
    });
    adminPage.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Dev Member');
      expect(dialog.message()).toContain('Clear all removals');
      expect(removes).toBe(0);
      await dialog.dismiss();
    });
    await remove.focus();
    await adminPage.keyboard.press('Enter');
    await expect(remove).toBeFocused();
    await expect(removedRow).toBeVisible();
    expect(removes).toBe(0);

    await adminPage.context().setOffline(true);
    adminPage.once('dialog', (dialog) => dialog.accept());
    await remove.click();
    await expect(adminPage.getByRole('alert')).toContainText('Check your connection and try again.');
    await expect(remove).toBeEnabled();
    await adminPage.screenshot({ path: test.info().outputPath('removal-error-mobile.png'), fullPage: true });
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await adminPage.context().setOffline(false);
    adminPage.once('dialog', (dialog) => dialog.accept());
    await remove.click();
    await expect(removedRow).toHaveCount(0);
    await expect(adminPage.getByText('1 member', { exact: true })).toBeVisible();
    await page.goto(path);
    await blocked(page);
    await page.screenshot({ path: test.info().outputPath('blocked-mobile.png'), fullPage: true });

    const clear = adminPage.getByRole('button', { name: 'Clear all removals', exact: true });
    adminPage.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('can’t be undone');
      expect(dialog.message()).toContain('Join');
      await dialog.dismiss();
    });
    await clear.click();
    expect(clears).toBe(0);
    await page.reload();
    await blocked(page);
    adminPage.once('dialog', (dialog) => dialog.accept());
    await clear.focus();
    await adminPage.keyboard.press('Enter');
    await expect(adminPage.getByRole('status')).toHaveText('All removals cleared. People can rejoin through a valid invite link by tapping Join.');
    expect(clears).toBe(1);
    await expect(removedRow).toHaveCount(0);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'You’re about to join Trusted friends' })).toBeVisible();
    await expect(page.getByText('1 member', { exact: true })).toBeVisible();
    expect((await (await page.request.get(`${api}/circles`)).json()).data.items).toEqual([]);

    // Another tab joins and is removed while this tab still has its eligible preview.
    const code = path.split('/').at(-1)!;
    expect((await page.request.post(`${api}/circle-invites/${code}/join`, { headers })).ok()).toBeTruthy();
    await adminPage.reload();
    adminPage.once('dialog', (dialog) => dialog.accept());
    await remove.click();
    await expect(removedRow).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'You’re about to join Trusted friends' })).toBeVisible();
    const refusedJoin = page.waitForResponse(`${api}/circle-invites/${code}/join`);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    expect((await (await refusedJoin).json()).error).toMatchObject({ code: 'JOIN_BLOCKED', message: blockedMessage });
    await blocked(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: test.info().outputPath('blocked-desktop.png'), fullPage: true });

    const clearedAgain = adminPage.waitForResponse(`${api}/circles/${id}/removals/clear`);
    adminPage.once('dialog', (dialog) => dialog.accept());
    await clear.click();
    expect((await clearedAgain).ok()).toBeTruthy();
    await expect(adminPage.getByRole('status')).toContainText('All removals cleared.');
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'You’re about to join Trusted friends' })).toBeVisible();
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Circle members' }).getByRole('listitem')).toHaveCount(2);
    await adminPage.reload();
    await adminPage.setViewportSize({ width: 1280, height: 900 });
    await expect(remove).toBeVisible();
    await adminPage.screenshot({ path: test.info().outputPath('removals-desktop.png'), fullPage: true });
  } finally { await admin.close(); }
});

test('done-when-6: only the admin sees removal controls and their own row has no Remove', async ({ page, browser }) => {
  const admin = await browser.newContext();
  try {
    await member(admin, 'Asha Admin');
    await member(page.context(), 'Dev Member');
    const { id, path } = await circle(admin);
    await page.goto(path);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Leave circle', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Remove|Clear all removals|Rename|Hand over|Delete circle|Reset link/i })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Invite link' })).toHaveCount(0);
    const adminPage = await admin.newPage();
    await adminPage.goto(`/circles/${id}`);
    await expect(adminPage.getByRole('listitem').filter({ hasText: 'Asha Admin' }).getByRole('button', { name: /Remove/ })).toHaveCount(0);
    await expect(adminPage.getByRole('button', { name: 'Remove Dev Member' })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'Clear all removals', exact: true })).toBeVisible();
  } finally { await admin.close(); }
});
