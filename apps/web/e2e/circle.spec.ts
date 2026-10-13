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

async function circle(context: BrowserContext) {
  const response = await context.request.post(`${api}/circles`, { data: { name: 'College batch' }, headers });
  expect(response.status()).toBe(201);
  return (await response.json()).data.id as string;
}

test('done-when-4: only members see the circle name, every display name and the admin', async ({ page, browser }) => {
  await member(page.context(), 'Asha Admin');
  const id = await circle(page.context());
  const invite = (await (await page.request.get(`${api}/circles/${id}/invite`)).json()).data.url as string;
  const second = await browser.newContext();
  const outsider = await browser.newContext();
  try {
    await member(second, 'Dev Member');
    expect((await second.request.post(`${api}/circle-invites/${invite.split('/').at(-1)}/join`, { headers })).ok()).toBeTruthy();
    for (const context of [page.context(), second]) {
      const view = context === page.context() ? page : await context.newPage();
      await view.goto(`/circles/${id}`);
      await expect(view.getByRole('heading', { name: 'College batch', exact: true })).toBeVisible();
      const members = view.getByRole('list', { name: 'Circle members' });
      await expect(members.getByRole('listitem')).toHaveCount(2);
      await expect(members.getByRole('listitem').filter({ hasText: 'Asha Admin' }).getByText('Admin', { exact: true })).toBeVisible();
      await expect(members.getByRole('listitem').filter({ hasText: 'Dev Member' })).toBeVisible();
      await expect(members.getByRole('listitem').filter({ hasText: 'Dev Member' })).not.toContainText('Admin');
      await expect(view.getByText('9876543210', { exact: false })).toHaveCount(0);
      const response = await context.request.get(`${api}/circles/${id}`);
      expect(response.status()).toBe(200);
      expect((await response.json()).data.members).toEqual(expect.arrayContaining([
        expect.objectContaining({ displayName: 'Asha Admin', isAdmin: true }),
        expect.objectContaining({ displayName: 'Dev Member', isAdmin: false }),
      ]));
      expect(await response.text()).not.toContain('whatsapp');
      if (context === second) {
        await expect(view.getByRole('textbox', { name: 'Invite link' })).toHaveCount(0);
        await expect(view.getByRole('button', { name: 'Copy', exact: true })).toHaveCount(0);
        await expect(view.getByRole('link', { name: 'Share on WhatsApp' })).toHaveCount(0);
        await expect(view.getByRole('button', { name: 'Reset link' })).toHaveCount(0);
        for (const [method, suffix, data] of [['GET', '', undefined], ['POST', '/reset', undefined], ['POST', '/record', { action: 'copy' }]] as const) {
          expect((await second.request.fetch(`${api}/circles/${id}/invite${suffix}`, { method, headers, data })).status()).toBe(403);
        }
        await view.screenshot({ path: test.info().outputPath('member-mobile.png'), fullPage: true });
      }
    }
    await member(outsider, 'Outside Member');
    const denied = await outsider.request.get(`${api}/circles/${id}`);
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toMatch(/College batch|Asha Admin|Dev Member|whatsapp/);
    const outsidePage = await outsider.newPage();
    await outsidePage.goto(`/circles/${id}`);
    await expect(outsidePage.getByRole('heading', { name: 'Circle unavailable' })).toBeVisible();
    await expect(outsidePage.getByText(/College batch|Asha Admin|Dev Member/)).toHaveCount(0);
    await outsidePage.getByRole('link', { name: 'Back to your circles' }).click();
    await expect(outsidePage.getByRole('heading', { name: 'Your circles', exact: true })).toBeVisible();
  } finally {
    await second.close();
    await outsider.close();
  }
});

test('done-when-2: the admin copies, shares and resets the link without waiting for usage recording', async ({ page, browser }) => {
  test.setTimeout(60_000);
  await member(page.context(), 'Asha Admin');
  const id = await circle(page.context());
  const existingMember = await browser.newContext();
  try {
    await member(existingMember, 'Dev Member');
    const invite = (await (await page.request.get(`${api}/circles/${id}/invite`)).json()).data.url as string;
    expect((await existingMember.request.post(`${api}/circle-invites/${invite.split('/').at(-1)}/join`, { headers })).ok()).toBeTruthy();
  } finally { await existingMember.close(); }
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  // WhatsApp is the third-party edge. Circle and usage requests use the running API unchanged.
  await page.context().route('https://wa.me/**', (route) => route.fulfill({ contentType: 'text/html', body: 'WhatsApp share preview' }));
  const actions: string[] = [];
  let resetRequests = 0;
  page.on('request', (request) => {
    if (request.url() === `${api}/circles/${id}/invite/record`) actions.push(request.postDataJSON().action);
    if (request.url() === `${api}/circles/${id}/invite/reset`) resetRequests++;
  });
  await page.goto(`/circles/${id}`);
  const link = page.getByRole('textbox', { name: 'Invite link' });
  await expect(link).toHaveValue(/\/circles\/join\/[A-Za-z0-9_-]{22}$/);
  const oldLink = await link.inputValue();
  const copy = page.getByRole('button', { name: 'Copy', exact: true });
  await link.focus();
  await page.keyboard.press('Tab');
  await expect(copy).toBeFocused();
  const copiedRecord = page.waitForResponse(`${api}/circles/${id}/invite/record`);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Invite link copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(oldLink);
  expect((await copiedRecord).status()).toBe(200);
  expect(actions).toEqual(['copy']);

  const share = page.getByRole('link', { name: 'Share on WhatsApp' });
  await copy.focus();
  await page.keyboard.press('Tab');
  await expect(share).toBeFocused();
  const sharedRecord = page.waitForResponse(`${api}/circles/${id}/invite/record`);
  const popup = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const whatsapp = await popup;
  await expect(whatsapp).toHaveURL(/^https:\/\/wa.me\//);
  expect(new URL(whatsapp.url()).searchParams.get('text')).toBe(`Join my College batch circle on CreditWithFriends: ${oldLink}`);
  const shared = await sharedRecord;
  expect(shared.status()).toBe(200);
  expect((await shared.json()).data.whatsappUrl).toBe(whatsapp.url());
  expect(actions).toEqual(['copy', 'whatsapp']);
  await whatsapp.close();

  const reset = page.getByRole('button', { name: 'Reset link', exact: true });
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('old link will stop working'); await dialog.dismiss(); });
  await reset.click();
  await expect(link).toHaveValue(oldLink);
  expect(resetRequests).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await reset.click();
  await expect(page.getByRole('status')).toContainText('Invite link reset. Share the new link.');
  const newLink = await link.inputValue();
  expect(newLink).not.toBe(oldLink);
  expect(resetRequests).toBe(1);
  const dead = await page.request.get(`${api}/circle-invites/${oldLink.split('/').at(-1)}`);
  expect(dead.status()).toBe(404);
  expect((await dead.json()).error.message).toBe('This invite link is no longer valid. Ask the person who shared it for a new one.');
  const active = await page.request.get(`${api}/circle-invites/${newLink.split('/').at(-1)}`);
  expect(active.status()).toBe(200);
  expect((await active.json()).data).toEqual({ status: 'already_member', circleId: id });
  await expect(page.getByRole('list', { name: 'Circle members' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('listitem').filter({ hasText: 'Dev Member' })).toBeVisible();
  await page.reload();
  await expect(link).toHaveValue(newLink);
  expect(new URL((await share.getAttribute('href'))!).searchParams.get('text')).toContain(newLink);
  await page.screenshot({ path: test.info().outputPath('admin-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('admin-desktop.png'), fullPage: true });

  await page.context().setOffline(true);
  const failedRecord = page.waitForEvent('requestfailed', { predicate: (request) => request.url().endsWith('/invite/record') });
  await copy.click();
  await expect(page.getByRole('status')).toContainText('Invite link copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(newLink);
  await failedRecord;
  expect(actions).toEqual(['copy', 'whatsapp', 'copy']);
  const failedShareRecord = page.waitForEvent('requestfailed', { predicate: (request) => request.url().endsWith('/invite/record') });
  const offlinePopup = page.waitForEvent('popup');
  await share.click();
  const offlineWhatsapp = await offlinePopup;
  await expect(offlineWhatsapp).toHaveURL(/^https:\/\/wa.me\//);
  expect(new URL(offlineWhatsapp.url()).searchParams.get('text')).toContain(newLink);
  await failedShareRecord;
  await offlineWhatsapp.close();
  expect(actions).toEqual(['copy', 'whatsapp', 'copy', 'whatsapp']);
  page.once('dialog', (dialog) => dialog.accept());
  await reset.click();
  await expect(page.getByRole('alert')).toContainText('We couldn’t reset the link. Please try again.');
  await expect(link).toHaveValue(newLink);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('reset-error-mobile.png'), fullPage: true });
  await page.context().setOffline(false);
  page.once('dialog', (dialog) => dialog.accept());
  await reset.click();
  await expect(page.getByRole('status')).toContainText('Invite link reset. Share the new link.');
});
