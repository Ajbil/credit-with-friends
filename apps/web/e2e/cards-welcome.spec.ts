import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const API = 'http://localhost:3104/api/v1';
const HEADERS = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };
const FLAG = 'cwf.just-onboarded-invite';
const INVALID = 'This invite link is no longer valid. Ask the person who shared it for a new one.';
let clientNumber = 0;

// Each setup client owns a rate-limit budget, as in the existing invite specs.
async function call(path: string, cookie = '', data?: unknown, localAddress = '127.24.0.1') {
  return new Promise<{ cookie: string; data: { id: string; url: string } }>((resolve, reject) => {
    const request = httpRequest(`${API.replace('localhost', '127.0.0.1')}/${path}`, {
      method: data === undefined ? 'GET' : 'POST', localAddress,
      headers: { ...HEADERS, cookie, 'content-type': 'application/json' },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { body += chunk; });
      response.on('end', () => {
        try {
          expect(response.statusCode, body).toBeLessThan(400);
          resolve({ cookie: response.headers['set-cookie']?.[0]?.split(';')[0] ?? '', data: JSON.parse(body).data });
        } catch (error) { reject(error); }
      });
      response.on('error', reject);
    });
    request.on('error', reject);
    request.end(data === undefined ? undefined : JSON.stringify(data));
  });
}

async function signIn(context?: BrowserContext, returnPath = '/', onboard = true) {
  const localAddress = `127.24.0.${++clientNumber}`;
  const signedIn = await call('test-auth/sign-in', '', {
    googleAccountId: randomUUID(), email: 'listed@example.in', name: 'Card holder', returnPath,
  }, localAddress);
  if (context) await context.addCookies([{ name: 'cwf_session', value: signedIn.cookie.slice('cwf_session='.length), domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  if (onboard) await call('onboarding', signedIn.cookie, {
    displayName: 'Card holder', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1,
  }, localAddress);
  return { cookie: signedIn.cookie, localAddress };
}

async function createInvite(admin: Awaited<ReturnType<typeof signIn>>, name = 'Family') {
  const circle = await call('circles', admin.cookie, { name }, admin.localAddress);
  const invite = await call(`circles/${circle.data.id}/invite`, admin.cookie, undefined, admin.localAddress);
  return { circleId: circle.data.id, path: new URL(invite.data.url).pathname };
}

async function finishOnboarding(page: Page) {
  await expect(page.getByRole('heading', { name: 'Finish your account' })).toBeVisible();
  await page.getByLabel('WhatsApp number').fill('9876543210');
  await page.getByLabel('I confirm I am 18 or older.').check();
  await page.getByLabel('I agree to the privacy notice.').check();
  await page.getByRole('button', { name: 'Create my account' }).click();
}

async function onboardThroughInvite(page: Page, path: string) {
  const visitor = await signIn(page.context(), path, false);
  await page.goto(path);
  await finishOnboarding(page);
  await expect(page).toHaveURL(path);
  return visitor;
}

async function expectWelcome(page: Page, circleId?: string) {
  await expect(page.getByRole('heading', { name: 'Add your cards', exact: true })).toBeVisible();
  await expect(page).toHaveURL(`/cards/welcome${circleId ? `?returnTo=${encodeURIComponent(`/circles/${circleId}`)}` : ''}`);
  await expect(page).toHaveTitle('Add your cards | CreditWithFriends');
}

async function addCard(page: Page) {
  await page.getByRole('link', { name: 'Add a card', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add a card', exact: true })).toBeVisible();
  await page.getByLabel('Bank', { exact: true }).selectOption('hdfc-bank');
  await page.getByLabel('Variant (optional)').fill('Millennia');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

async function flag(page: Page) {
  return page.evaluate((key) => sessionStorage.getItem(key), FLAG);
}

async function capture(page: Page) {
  for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: test.info().outputPath(`welcome-${name}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

for (const action of ['skip', 'add'] as const) {
  test(`done-when-5: plain onboarding invites cards; ${action} leads to ${action === 'skip' ? 'your circles' : 'Your cards'}`, async ({ page }) => {
    await signIn(page.context(), '/', false);
    await page.goto('/onboarding');
    await finishOnboarding(page);
    await expectWelcome(page);
    await page.getByRole('link', { name: 'CreditWithFriends home' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Add a card', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip for now' });
    await expect(skip).toBeFocused();
    if (action === 'skip') {
      await capture(page);
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL('/');
      await expect(page.getByRole('heading', { name: 'Your circles' })).toBeVisible();
      await page.getByRole('link', { name: 'Your cards', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Your cards', exact: true })).toBeVisible();
    } else {
      await addCard(page);
      await expect(page).toHaveURL('/cards');
      await expect(page.getByRole('list', { name: 'Your cards' })).toContainText('Millennia');
    }
  });

  test(`done-when-5: the invite comes first, then cards; ${action} returns to that circle once`, async ({ page }) => {
    const invite = await createInvite(await signIn());
    await onboardThroughInvite(page, invite.path);
    await expect(page.getByRole('heading', { name: 'You’re about to join Family' })).toBeVisible();
    expect(await flag(page)).toBe(invite.path);
    await expect(page.getByRole('heading', { name: 'Add your cards' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expectWelcome(page, invite.circleId);
    expect(await flag(page)).toBeNull();
    if (action === 'skip') await page.getByRole('link', { name: 'Skip for now' }).click();
    else {
      await addCard(page);
      expect((await (await page.request.get(`${API}/me/cards`)).json()).data.items).toMatchObject([{ bankId: 'hdfc-bank', variant: 'Millennia' }]);
    }
    await expect(page).toHaveURL(`/circles/${invite.circleId}`);
    await expect(page.getByRole('heading', { name: 'Family', exact: true })).toBeVisible();
    await page.goto(invite.path);
    await expect(page).toHaveURL(`/circles/${invite.circleId}`);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Family', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add your cards' })).toHaveCount(0);
  });
}

test('done-when-5: a failed invite load keeps the invitation for a successful retry', async ({ page }) => {
  const invite = await createInvite(await signIn());
  await signIn(page.context(), invite.path, false);
  await page.goto(invite.path);
  await expect(page.getByRole('heading', { name: 'Finish your account' })).toBeVisible();
  await page.route('**/api/v1/circle-invites/*', (route) => route.abort('internetdisconnected'));
  await finishOnboarding(page);
  await expect(page.getByRole('alert')).toHaveText('We couldn’t load this invite. Check your connection and try again.');
  expect(await flag(page)).toBe(invite.path);
  await page.unroute('**/api/v1/circle-invites/*');
  await page.getByRole('button', { name: 'Try again' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expectWelcome(page, invite.circleId);
});

test('done-when-5: a failed Join keeps the invitation for a successful retry', async ({ page }) => {
  const invite = await createInvite(await signIn());
  await onboardThroughInvite(page, invite.path);
  await page.route('**/api/v1/circle-invites/*/join', (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('We couldn’t join this circle. Check your connection and try again.');
  expect(await flag(page)).toBe(invite.path);
  await page.unroute('**/api/v1/circle-invites/*/join');
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expectWelcome(page, invite.circleId);
});

test('done-when-5: an already-member redirect consumes the matching invitation only once', async ({ page }) => {
  const invite = await createInvite(await signIn());
  const visitor = await onboardThroughInvite(page, invite.path);
  await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
  // Another tab joined before this tab reloads the invite.
  await call(`circle-invites/${invite.path.split('/').at(-1)}/join`, visitor.cookie, {}, visitor.localAddress);
  await page.reload();
  await expectWelcome(page, invite.circleId);
  expect(await flag(page)).toBeNull();
  await page.goto(invite.path);
  await expect(page).toHaveURL(`/circles/${invite.circleId}`);
  await expect(page.getByRole('heading', { name: 'Family', exact: true })).toBeVisible();
});

test('done-when-5: opening a different invite clears the first invitation', async ({ page }) => {
  const admin = await signIn();
  const first = await createInvite(admin);
  const second = await createInvite(admin, 'Office');
  await onboardThroughInvite(page, first.path);
  expect(await flag(page)).toBe(first.path);
  await page.goto(second.path);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).toHaveURL(`/circles/${second.circleId}`);
  expect(await flag(page)).toBeNull();
  await page.goto(first.path);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).toHaveURL(`/circles/${first.circleId}`);
});

for (const result of ['reset before load', 'reset before Join', 'blocked preview', 'refused Join', 'membership limit'] as const) {
  test(`done-when-5: a terminal invite result clears the invitation (${result})`, async ({ page }) => {
    const admin = await signIn();
    const invite = await createInvite(admin);
    let visitor: Awaited<ReturnType<typeof signIn>>;
    if (result === 'reset before load') {
      visitor = await signIn(page.context(), invite.path, false);
      await page.goto(invite.path);
      await expect(page.getByRole('heading', { name: 'Finish your account' })).toBeVisible();
      await call(`circles/${invite.circleId}/invite/reset`, admin.cookie, {}, admin.localAddress);
      await finishOnboarding(page);
    } else {
      visitor = await onboardThroughInvite(page, invite.path);
      await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
      if (result === 'reset before Join') {
        await call(`circles/${invite.circleId}/invite/reset`, admin.cookie, {}, admin.localAddress);
        await page.getByRole('button', { name: 'Join', exact: true }).click();
      } else if (result === 'membership limit') {
        for (let index = 0; index < 20; index++) await call('circles', visitor.cookie, { name: `Circle ${index}` }, visitor.localAddress);
        await page.getByRole('button', { name: 'Join', exact: true }).click();
      } else {
        await call(`circle-invites/${invite.path.split('/').at(-1)}/join`, visitor.cookie, {}, visitor.localAddress);
        const profile = await page.request.get(`${API}/members/me`);
        const memberId: string = (await profile.json()).data.id;
        await call(`circles/${invite.circleId}/members/${memberId}/remove`, admin.cookie, {}, admin.localAddress);
        if (result === 'blocked preview') await page.reload();
        else await page.getByRole('button', { name: 'Join', exact: true }).click();
      }
    }
    await expect(page.getByRole('alert')).toHaveText(result.startsWith('reset') ? INVALID : result === 'membership limit' ? 'You can belong to at most 20 circles.' : "You can't join this circle.");
    expect(await flag(page)).toBeNull();
    await expect(page.getByRole('heading', { name: 'Add your cards' })).toHaveCount(0);
    // Retry a valid invite in this tab after the terminal result: no stale invitation.
    if (result === 'membership limit') {
      const circles = (await (await page.request.get(`${API}/circles`)).json()).data.items as Array<{ id: string }>;
      await call(`circles/${circles[0].id}/leave`, visitor.cookie, {}, visitor.localAddress);
    }
    const active = await call(`circles/${invite.circleId}/invite/reset`, admin.cookie, {}, admin.localAddress);
    await call(`circles/${invite.circleId}/removals/clear`, admin.cookie, {}, admin.localAddress);
    await page.goto(new URL(active.data.url).pathname);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page).toHaveURL(`/circles/${invite.circleId}`);
  });
}

test('done-when-5: an existing member opening an invite has no onboarding invitation', async ({ page }) => {
  const invite = await createInvite(await signIn());
  await signIn(page.context());
  await page.goto(invite.path);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page).toHaveURL(`/circles/${invite.circleId}`);
});

for (const blockedOperation of ['getItem', 'setItem', 'removeItem'] as const) {
  test(`done-when-5: blocked session storage skips the invite invitation (${blockedOperation})`, async ({ page }) => {
    const invite = await createInvite(await signIn());
    // Simulate browser privacy settings at the storage edge; all app APIs stay real.
    await page.addInitScript((operation) => {
      const original = Storage.prototype[operation];
      Storage.prototype[operation] = function (...args: Parameters<typeof original>) {
        if (this === window.sessionStorage) throw new DOMException('Storage blocked', 'SecurityError');
        return Reflect.apply(original, this, args);
      };
    }, blockedOperation);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await onboardThroughInvite(page, invite.path);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page).toHaveURL(`/circles/${invite.circleId}`);
    await expect(page.getByRole('heading', { name: 'Family', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}
