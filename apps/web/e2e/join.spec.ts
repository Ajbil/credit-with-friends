import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { expect, test, type BrowserContext } from '@playwright/test';

const api = `${process.env.CWF_JOIN_TEST_API_ORIGIN ?? 'http://localhost:3104'}/api/v1`;
const headers = { origin: process.env.CWF_JOIN_TEST_WEB_ORIGIN ?? 'http://localhost:5173', 'x-requested-with': 'cwf' };
const invalidMessage = 'This invite link is no longer valid. Ask the person who shared it for a new one.';
let clientNumber = 0;

// Separate loopback clients exercise the real admission rate limit without shared setup exhausting it.
async function call(path: string, cookie = '', data?: unknown, localAddress = '127.21.0.1') {
  return new Promise<{ status: number; cookie: string; data: { id: string; url: string } }>((resolve, reject) => {
    const url = new URL(`${api}/${path}`);
    url.hostname = '127.0.0.1';
    const request = httpRequest(url, {
      method: data === undefined ? 'GET' : 'POST', localAddress,
      headers: { ...headers, cookie, 'content-type': 'application/json' },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => {
        try {
          expect(response.statusCode, body).toBeLessThan(400);
          resolve({ status: response.statusCode!, cookie: response.headers['set-cookie']?.[0]?.split(';')[0] ?? '', data: JSON.parse(body).data });
        } catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(data === undefined ? undefined : JSON.stringify(data));
  });
}

async function signIn(context?: BrowserContext, returnPath = '/', name = 'Invite visitor', onboard = true) {
  const localAddress = `127.21.0.${++clientNumber}`;
  const signedIn = await call('test-auth/sign-in', '', {
    googleAccountId: randomUUID(), email: 'listed@example.in', name, returnPath,
  }, localAddress);
  const cookie = signedIn.cookie;
  expect(cookie).toMatch(/^cwf_session=/);
  if (context) await context.addCookies([{ name: 'cwf_session', value: cookie.slice('cwf_session='.length), domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  if (onboard) await call('onboarding', cookie, {
    displayName: name, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1,
  }, localAddress);
  return { cookie, localAddress };
}

async function createInvite(admin: Awaited<ReturnType<typeof signIn>>, name: string) {
  const created = await call('circles', admin.cookie, { name }, admin.localAddress);
  const invite = await call(`circles/${created.data.id}/invite`, admin.cookie, undefined, admin.localAddress);
  return { circleId: created.data.id, path: new URL(invite.data.url).pathname };
}

test('done-when-3: an invite returns through sign-in and onboarding, joins only on Join, and validates dead links for everyone', async ({ page, browser }) => {
  const adminContext = await browser.newContext();
  try {
    const admin = await signIn(adminContext, '/', 'Private admin name');
    const invite = await createInvite(admin, 'College batch');
    await page.goto(invite.path);
    const google = page.getByRole('link', { name: 'Continue with Google' });
    await expect(google).toBeVisible();
    const googleUrl = new URL((await google.getAttribute('href'))!);
    expect(googleUrl.pathname).toBe('/api/v1/auth/google/start');
    expect(googleUrl.searchParams.get('returnTo')).toBe(invite.path);
    await expect(page.getByText('College batch', { exact: true })).toHaveCount(0);

    // Only Google's identity verification is substituted; the app must send the person to setup.
    await signIn(page.context(), googleUrl.searchParams.get('returnTo')!, 'New member', false);
    await page.reload();
    await expect(page).toHaveURL(`/onboarding?returnTo=${encodeURIComponent(invite.path)}`);
    await expect(page.getByRole('heading', { name: 'Finish your account' })).toBeVisible();
    await expect(google).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
    await page.getByLabel('WhatsApp number').fill('9876543210');
    await page.getByLabel('I confirm I am 18 or older.').check();
    await page.getByLabel('I agree to the privacy notice.').check();
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page).toHaveURL(invite.path);
    await expect(page.getByRole('heading', { name: 'You’re about to join College batch', exact: true })).toBeVisible();
    await expect(page.getByText('1 member', { exact: true })).toBeVisible();
    await expect(page.getByText('Private admin name', { exact: true })).toHaveCount(0);
    expect((await (await page.request.get(`${api}/circles`)).json()).data.items).toEqual([]);
    // The API deliberately hides a non-member's circle behind a not-found response.
    expect((await page.request.get(`${api}/circles/${invite.circleId}`)).status()).toBe(404);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: test.info().outputPath('desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });

    await page.getByRole('link', { name: 'CreditWithFriends home' }).focus();
    await page.keyboard.press('Tab');
    const join = page.getByRole('button', { name: 'Join', exact: true });
    await expect(join).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`/circles/${invite.circleId}`);
    expect((await (await page.request.get(`${api}/circles`)).json()).data.items).toEqual([
      expect.objectContaining({ id: invite.circleId, name: 'College batch', memberCount: 2, isAdmin: false }),
    ]);
    await page.goto(invite.path);
    await expect(page).toHaveURL(`/circles/${invite.circleId}`);

    const reset = await adminContext.request.post(`${api}/circles/${invite.circleId}/invite/reset`, { headers });
    expect(reset.ok()).toBeTruthy();
    const activePath = new URL((await reset.json()).data.url).pathname;
    const adminPage = await adminContext.newPage();
    for (const visitor of [page, adminPage]) {
      for (const path of [invite.path, '/circles/join/bad!', '/circles/join/bad%2Fcode', `/circles/join/${'A'.repeat(22)}`]) {
        await visitor.goto(path);
        await expect(visitor.getByRole('alert')).toHaveText(invalidMessage);
        await expect(visitor.getByText(/College batch|Private admin name/)).toHaveCount(0);
        await expect(visitor.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0);
      }
      await visitor.goto(activePath);
      await expect(visitor).toHaveURL(`/circles/${invite.circleId}`);
    }
    await page.context().clearCookies();
    await page.goto(invite.path);
    await expect(page.getByRole('alert')).toHaveText(invalidMessage);
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveCount(0);
    await signIn(page.context(), invite.path, 'Pending visitor', false);
    await page.reload();
    await expect(page.getByRole('alert')).toHaveText(invalidMessage);
    await expect(page).toHaveURL(invite.path);
    await expect(page.getByRole('heading', { name: 'Finish your account' })).toHaveCount(0);
  } finally { await adminContext.close(); }
});

test('done-when-3: a stale invite reports joining limits from the real API without adding membership', async ({ page }) => {
  test.setTimeout(120_000);
  const admin = await signIn();
  const visitor = await signIn(page.context());
  const invite = await createInvite(admin, 'Office');
  const code = invite.path.split('/').at(-1)!;
  await page.goto(invite.path);
  const join = page.getByRole('button', { name: 'Join', exact: true });
  await expect(join).toBeVisible();
  await expect(page.getByText('1 member', { exact: true })).toBeVisible();
  // The member reaches their limit after opening the invite: the tap must still check again.
  for (let index = 1; index <= 20; index++) {
    await call('circles', visitor.cookie, { name: `Existing circle ${index}` }, visitor.localAddress);
  }
  await join.click();
  await expect(page.getByRole('alert')).toHaveText('You can belong to at most 20 circles.');
  expect((await (await page.request.get(`${api}/circles?limit=20`)).json()).data.items).toHaveLength(20);
  expect((await page.request.get(`${api}/circles/${invite.circleId}`)).status()).toBe(404);

  for (let index = 1; index <= 98; index++) {
    const member = await signIn();
    await call(`circle-invites/${code}/join`, member.cookie, {}, member.localAddress);
  }
  await page.reload();
  await expect(page.getByText('99 members', { exact: true })).toBeVisible();
  const lastMember = await signIn();
  await call(`circle-invites/${code}/join`, lastMember.cookie, {}, lastMember.localAddress);
  await join.click();
  await expect(page.getByRole('alert')).toHaveText('This circle is full. Ask the admin for another circle.');
  await expect(join).toBeEnabled();
  expect((await page.request.get(`${api}/circles/${invite.circleId}`)).status()).toBe(404);
  await page.reload();
  await expect(page.getByText('100 members', { exact: true })).toBeVisible();
});

test('done-when-3: joining recovers from connection and session failures and hides an invite reset after preview', async ({ page }) => {
  const admin = await signIn();
  await signIn(page.context());
  const invite = await createInvite(admin, 'Family');
  await page.goto(invite.path);
  const join = page.getByRole('button', { name: 'Join', exact: true });
  await expect(join).toBeVisible();
  await page.context().setOffline(true);
  await join.click();
  await expect(page.getByRole('alert')).toHaveText('We couldn’t join this circle. Check your connection and try again.');
  await expect(join).toBeEnabled();
  await page.context().setOffline(false);
  expect((await (await page.request.get(`${api}/circles`)).json()).data.items).toEqual([]);

  // Ending a session after preview must validate again and preserve this invite for sign-in.
  await page.context().clearCookies();
  await join.click();
  const google = page.getByRole('link', { name: 'Continue with Google' });
  await expect(google).toBeVisible();
  expect(new URL((await google.getAttribute('href'))!).searchParams.get('returnTo')).toBe(invite.path);
  await expect(page.getByText('Family', { exact: true })).toHaveCount(0);
  await signIn(page.context());
  await page.reload();
  await expect(join).toBeVisible();
  await call(`circles/${invite.circleId}/invite/reset`, admin.cookie, {}, admin.localAddress);
  await join.click();
  await expect(page.getByRole('alert')).toHaveText(invalidMessage);
  await expect(page.getByText(/Family|1 member/)).toHaveCount(0);
  await expect(join).toHaveCount(0);
});
