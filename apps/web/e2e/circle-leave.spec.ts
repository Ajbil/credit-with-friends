import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';

const api = 'http://localhost:3104/api/v1';
const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };

async function member(context: BrowserContext, displayName: string) {
  const response = await context.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: displayName }, headers,
  });
  expect(response.ok()).toBeTruthy();
  const session = response.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await context.addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  expect((await context.request.post(`${api}/onboarding`, {
    data: { displayName, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers,
  })).ok()).toBeTruthy();
}

async function circle(context: BrowserContext, name: string) {
  const response = await context.request.post(`${api}/circles`, { data: { name }, headers });
  expect(response.status()).toBe(201);
  const id = (await response.json()).data.id as string;
  const invite = await context.request.get(`${api}/circles/${id}/invite`);
  expect(invite.ok()).toBeTruthy();
  return { id, invitePath: new URL((await invite.json()).data.url).pathname };
}

test('done-when-1: members can cancel, confirm and rejoin, with succession and deletion warnings before leaving', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const admin = await browser.newContext();
  try {
    await member(admin, 'Asha Admin');
    const { id, invitePath } = await circle(admin, 'College batch');
    await member(page.context(), 'Dev Member');
    await circle(page.context(), 'Other friends');
    await page.goto(invitePath);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'College batch', exact: true })).toBeVisible();
    // Visit the list first so leaving must also retire a previously loaded membership.
    await page.getByRole('link', { name: 'Back to your circles' }).click();
    await page.getByRole('link', { name: /^College batch/ }).click();

    const leave = page.getByRole('button', { name: 'Leave circle', exact: true });
    let requests = 0;
    page.on('request', (request) => { if (request.url() === `${api}/circles/${id}/leave`) requests++; });
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('College batch');
      expect(dialog.message()).not.toContain('admin role');
      expect(dialog.message()).not.toContain('deleted');
      expect(requests).toBe(0);
      await dialog.dismiss();
    });
    await leave.focus();
    await page.keyboard.press('Enter');
    await expect(leave).toBeFocused();
    await expect(page.getByRole('listitem').filter({ hasText: 'Dev Member' })).toBeVisible();
    expect(requests).toBe(0);

    await page.context().setOffline(true);
    page.once('dialog', (dialog) => dialog.accept());
    await leave.click();
    await expect(page.getByRole('alert')).toContainText('Check your connection and try again.');
    await expect(leave).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath('leave-error-mobile.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.context().setOffline(false);
    page.once('dialog', (dialog) => dialog.accept());
    const left = page.waitForResponse(`${api}/circles/${id}/leave`);
    await leave.click();
    expect((await left).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Your circles', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^College batch/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Other friends/ })).toBeVisible();
    await page.goto(invitePath);
    await expect(page.getByRole('heading', { name: 'You’re about to join College batch' })).toBeVisible();
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Dev Member' })).toBeVisible();

    // Use the same two accounts for all roles so this test does not consume
    // extra sign-ins from the running API's shared rate limit.
    const adminPage = await admin.newPage();
    for (const { view, warning, lastMember } of [
      { view: adminPage, warning: 'admin role will pass to the earliest-joined remaining member', lastMember: false },
      { view: page, warning: 'circle will be deleted', lastMember: true },
    ]) {
      await view.setViewportSize({ width: 390, height: 844 });
      await view.goto(`/circles/${id}`);
      await expect(view.getByRole('textbox', { name: 'Invite link' })).toBeVisible();
      await expect(view.getByRole('list', { name: 'Circle members' }).getByRole('listitem')).toHaveCount(lastMember ? 1 : 2);
      await view.screenshot({ path: test.info().outputPath(`leave-admin-${lastMember ? 'last' : 'succession'}-mobile.png`), fullPage: true });
      await view.setViewportSize({ width: 1280, height: 900 });
      await view.screenshot({ path: test.info().outputPath(`leave-admin-${lastMember ? 'last' : 'succession'}-desktop.png`), fullPage: true });
      let actionRequests = 0;
      view.on('request', (request) => { if (request.url() === `${api}/circles/${id}/leave`) actionRequests++; });
      const adminLeave = view.getByRole('button', { name: 'Leave circle', exact: true });
      view.once('dialog', async (dialog) => {
        expect(dialog.message()).toContain('College batch');
        expect(dialog.message()).toContain(warning);
        if (lastMember) expect(dialog.message()).not.toContain('You can join again');
        expect(actionRequests).toBe(0);
        await dialog.dismiss();
      });
      await adminLeave.click();
      await expect(view.getByRole('heading', { name: 'College batch', exact: true })).toBeVisible();
      expect(actionRequests).toBe(0);
      view.once('dialog', (dialog) => dialog.accept());
      await adminLeave.click();
      await expect(view.getByRole('heading', { name: 'Your circles', exact: true })).toBeVisible();
      await expect(view.getByRole('link', { name: /^College batch/ })).toHaveCount(0);
      expect(actionRequests).toBe(1);
    }
  } finally { await admin.close(); }
});
