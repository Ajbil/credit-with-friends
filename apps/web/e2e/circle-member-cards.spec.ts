import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const API = 'http://localhost:3104/api/v1';
const HEADERS = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };

async function member(context: BrowserContext, displayName: string) {
  const signIn = await context.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: displayName }, headers: HEADERS,
  });
  expect(signIn.ok()).toBeTruthy();
  const session = signIn.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await context.addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  expect((await context.request.post(`${API}/onboarding`, {
    data: { displayName, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers: HEADERS,
  })).ok()).toBeTruthy();
}

async function shareCircle(viewer: BrowserContext, holder: BrowserContext) {
  await member(viewer, 'Asha Admin');
  await member(holder, 'Dev Member');
  const created = await viewer.request.post(`${API}/circles`, { data: { name: 'College batch' }, headers: HEADERS });
  expect(created.status()).toBe(201);
  const circleId = (await created.json()).data.id as string;
  const invite = await viewer.request.get(`${API}/circles/${circleId}/invite`);
  expect(invite.ok()).toBeTruthy();
  const code = (await invite.json()).data.url.split('/').at(-1) as string;
  expect((await holder.request.post(`${API}/circle-invites/${code}/join`, { headers: HEADERS })).ok()).toBeTruthy();
  return circleId;
}

async function capture(page: Page, state: string) {
  for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: test.info().outputPath(`${state}-${name}.png`), fullPage: true, scale: 'css' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

// The real API owns membership and current card data; no successful response is stubbed.
test('done-when-4: open another member from the circle, see current read-only cards, and lose access after they leave', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const holder = await browser.newContext();
  try {
    const circleId = await shareCircle(page.context(), holder);
    const holderPage = await holder.newPage();
    await holderPage.goto('/cards');
    await holderPage.getByRole('link', { name: 'Add a card', exact: true }).click();
    await holderPage.getByLabel('Bank', { exact: true }).selectOption('hdfc-bank');
    await holderPage.getByLabel('Card type').selectOption('credit');
    await holderPage.getByLabel('Variant (optional)').fill('Millennia');
    await holderPage.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(holderPage.getByRole('list', { name: 'Your cards' })).toContainText('Millennia');

    await page.goto(`/circles/${circleId}`);
    const members = page.getByRole('list', { name: 'Circle members' });
    await expect(members.getByRole('listitem').filter({ hasText: 'Asha Admin' }).getByRole('link')).toHaveCount(0);
    const memberLink = members.getByRole('link', { name: 'View Dev Member’s cards', exact: true });
    await memberLink.focus();
    await expect(memberLink).toBeFocused();
    expect(await memberLink.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Dev Member’s cards', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Dev Member’s cards | CreditWithFriends');
    const cards = page.getByRole('list', { name: 'Member cards' });
    await expect(cards.getByRole('listitem')).toHaveCount(1);
    await expect(cards).toContainText('HDFC Bank');
    await expect(cards).toContainText('Credit card');
    await expect(cards).toContainText('Millennia');
    await expect(page.getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /\b(edit|remove|add a card|whatsapp)\b/i })).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await capture(page, 'member-cards');

    const ownCards = await holder.request.get(`${API}/me/cards`);
    const cardId = (await ownCards.json()).data.items[0].id as string;
    expect((await holder.request.patch(`${API}/me/cards/${cardId}`, {
      data: { bankId: 'federal-bank', type: 'debit', variant: 'Jupiter' }, headers: HEADERS,
    })).ok()).toBeTruthy();
    await page.reload();
    await expect(cards).toContainText('Federal Bank');
    await expect(cards).toContainText('Debit card');
    await expect(cards).toContainText('Jupiter');
    await expect(cards).not.toContainText('Millennia');
    expect((await holder.request.delete(`${API}/me/cards/${cardId}`, { headers: HEADERS })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'No cards listed yet' })).toBeVisible();
    await expect(page.getByText('Dev Member hasn’t listed any bank cards yet.')).toBeVisible();
    await capture(page, 'member-empty');

    expect((await holder.request.post(`${API}/circles/${circleId}/leave`, { headers: HEADERS })).ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Member cards unavailable' })).toBeVisible();
    await expect(page.getByText('Dev Member', { exact: false })).toHaveCount(0);
    await expect(cards).toHaveCount(0);
    await capture(page, 'member-unavailable');
    await page.getByRole('link', { name: 'Back to circle', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'College batch', exact: true })).toBeVisible();
  } finally { await holder.close(); }
});

test('done-when-4: a failed member-card load explains how to retry and then shows the real cards', async ({ page, browser }) => {
  const holder = await browser.newContext();
  try {
    const circleId = await shareCircle(page.context(), holder);
    expect((await holder.request.post(`${API}/me/cards`, {
      data: { bankId: 'hdfc-bank', type: 'credit', variant: 'Millennia' }, headers: HEADERS,
    })).status()).toBe(201);
    await page.goto(`/circles/${circleId}`);
    const path = `**/api/v1/circles/${circleId}/members/*/cards`;
    await page.route(path, (route) => route.abort('internetdisconnected'));
    await page.getByRole('link', { name: 'View Dev Member’s cards', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('We couldn’t load this member’s cards');
    await expect(page.getByText('Check your connection and try again.')).toBeVisible();
    await capture(page, 'member-load-failed');
    await page.unroute(path);
    await page.getByRole('button', { name: 'Try again', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('list', { name: 'Member cards' })).toContainText('Millennia');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to your circles', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your circles', exact: true })).toBeVisible();
  } finally { await holder.close(); }
});

test('done-when-4: returning in-app never reveals an earlier visit’s cards while membership is checked again', async ({ page, browser }) => {
  const holder = await browser.newContext();
  let release = () => {};
  try {
    const circleId = await shareCircle(page.context(), holder);
    expect((await holder.request.post(`${API}/me/cards`, {
      data: { bankId: 'hdfc-bank', type: 'credit', variant: 'Millennia' }, headers: HEADERS,
    })).status()).toBe(201);
    await page.goto(`/circles/${circleId}`);
    await page.getByRole('link', { name: 'View Dev Member’s cards', exact: true }).click();
    await expect(page.getByRole('list', { name: 'Member cards' })).toContainText('Millennia');
    await page.getByRole('link', { name: 'Back to circle', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'College batch', exact: true })).toBeVisible();
    expect((await holder.request.post(`${API}/circles/${circleId}/leave`, { headers: HEADERS })).ok()).toBeTruthy();

    const held = new Promise<void>((resolve) => { release = resolve; });
    let requested!: () => void;
    const requestStarted = new Promise<void>((resolve) => { requested = resolve; });
    await page.route(`**/api/v1/circles/${circleId}/members/*/cards`, async (route) => {
      requested();
      await held;
      await route.continue();
    });
    // Watch added/changed text, including nodes removed before the callback, so
    // a flash of private data cannot pass between two Playwright assertions.
    const exposure = await page.evaluateHandle(() => {
      const seen: string[] = [];
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const text = record.type === 'characterData'
            ? `${record.oldValue ?? ''} ${record.target.textContent ?? ''}`
            : Array.from(record.addedNodes, (node) => node.textContent ?? '').join(' ');
          if (/HDFC Bank|Millennia/.test(text)) seen.push(text);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
      return { seen, observer };
    });
    try {
      await page.goBack();
      await requestStarted;
      await expect(page.getByRole('status')).toHaveText('Loading this member’s cards…');
      await expect(page.getByText(/HDFC Bank|Millennia/)).toHaveCount(0);
      await capture(page, 'return-member-loading');
      release();
      await expect(page.getByRole('heading', { name: 'Member cards unavailable' })).toBeVisible();
      await expect(page.getByText(/HDFC Bank|Millennia/)).toHaveCount(0);
      expect(await exposure.evaluate(({ seen, observer }) => { observer.disconnect(); return seen; })).toEqual([]);
    } finally {
      release();
      await exposure.dispose();
    }
  } finally { release(); await holder.close(); }
});
