import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const API = 'http://localhost:3104/api/v1';
const HEADERS = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };
const REMINDER = 'The card holder places the order themselves. Never share card numbers, CVV, expiry dates or OTPs.';
const WARNING = 'Never share card numbers, CVV, expiry dates or OTPs.';
const RETRY = "We couldn't open WhatsApp. Check your connection and try again.";

async function member(context: BrowserContext, displayName: string) {
  const signedIn = await context.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: displayName }, headers: HEADERS,
  });
  expect(signedIn.ok()).toBeTruthy();
  const session = signedIn.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await context.addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  expect((await context.request.post(`${API}/onboarding`, {
    data: { displayName, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers: HEADERS,
  })).ok()).toBeTruthy();
}

async function sharedCircle(viewer: BrowserContext, holder: BrowserContext) {
  const created = await viewer.request.post(`${API}/circles`, { data: { name: 'Family' }, headers: HEADERS });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.id as string;
  const invite = await viewer.request.get(`${API}/circles/${id}/invite`);
  expect(invite.ok()).toBeTruthy();
  const code = ((await invite.json()).data.url as string).split('/').at(-1);
  expect(code).toBeDefined();
  expect((await holder.request.post(`${API}/circle-invites/${code}/join`, { headers: HEADERS })).ok()).toBeTruthy();
  return id;
}

async function addCard(holder: BrowserContext, variant?: string) {
  const added = await holder.request.post(`${API}/me/cards`, {
    data: { bankId: 'hdfc-bank', type: 'credit', ...(variant ? { variant } : {}) }, headers: HEADERS,
  });
  expect(added.status(), await added.text()).toBe(201);
  return (await added.json()).data.id as string;
}

async function openResults(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Find a card', exact: true }).click();
  await page.getByLabel('Bank or brand card').selectOption('hdfc-bank');
  await page.getByRole('radio', { name: 'Credit', exact: true }).check();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const results = page.getByRole('region', { name: 'Search results' });
  await expect(results.getByRole('heading', { name: 'Meera Shah' })).toBeVisible();
  return results;
}

async function openMemberCards(page: Page) {
  await page.goto('/');
  await page.getByRole('list', { name: 'Your circles' }).getByRole('link', { name: /Family/ }).click();
  await page.getByRole('list', { name: 'Circle members' }).getByRole('link', { name: /View Meera Shah.*cards/ }).click();
  const cards = page.getByRole('list', { name: 'Member cards' });
  await expect(cards).toContainText('HDFC Bank');
  return cards;
}

async function captureWidths(page: Page, screen: string) {
  for (const [name, width, height] of [['phone', 375, 844], ['tablet', 768, 1024], ['desktop', 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: test.info().outputPath(`${screen}-${name}.png`), fullPage: true, scale: 'css' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 844 });
}

async function expectReminderAboveButton(page: Page, button: ReturnType<Page['getByRole']>) {
  const reminder = page.getByText(REMINDER, { exact: true });
  await expect(reminder).toBeVisible();
  await expect(reminder.getByText(WARNING, { exact: true })).toHaveCount(1);
  const warningWeight = await reminder.getByText(WARNING, { exact: true }).evaluate((element) => Number.parseInt(getComputedStyle(element).fontWeight, 10));
  expect(warningWeight).toBeGreaterThanOrEqual(700);
  const reminderBox = await reminder.boundingBox();
  const buttonBox = await button.boundingBox();
  expect(reminderBox && buttonBox && reminderBox.y + reminderBox.height <= buttonBox.y).toBe(true);
}

// The real API returns every successful contact link. Only failed requests and the external navigation are intercepted.
async function exercisePress(page: Page, button: ReturnType<Page['getByRole']>, keyboardStart: ReturnType<Page['getByRole']>, expectedUrl: string) {
  const navigations: string[] = [];
  const pageCount = page.context().pages().length;
  await page.context().route('https://wa.me/**', (route) => {
    navigations.push(route.request().url());
    return route.abort();
  });
  let requests = 0;
  let release!: () => void;
  let started!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const requested = new Promise<void>((resolve) => { started = resolve; });
  await page.route('**/api/v1/contacts', async (route) => {
    requests++;
    if (requests === 1) return route.abort('internetdisconnected');
    if (requests === 2) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message: 'Server error', details: null, errorId: randomUUID() } }) });
    started();
    await held;
    return route.continue();
  });
  try {
    await button.click();
    await expect(button).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveText(RETRY);
    expect(navigations).toEqual([]);
    await button.click();
    await expect(button).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveText(RETRY);
    expect(navigations).toEqual([]);
    // Start before the action so Tab enters it, independent of pointer focus history.
    await keyboardStart.focus();
    await expect(keyboardStart).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    expect(await button.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    expect(await button.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await requested;
    await expect(button).toBeDisabled();
    await expect(button).toHaveText('Opening WhatsApp…');
    await button.dispatchEvent('click');
    expect(requests).toBe(3);
    release();
    await expect.poll(() => navigations).toEqual([expectedUrl]);
    expect(requests).toBe(3);
    expect(page.context().pages()).toHaveLength(pageCount);
  } finally { release(); }
}

test('done-when-3: a search result checks its card, retries failed presses and opens the editable WhatsApp message', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const holder = await browser.newContext();
  try {
    await member(page.context(), 'Shopper');
    await member(holder, 'Meera Shah');
    await sharedCircle(page.context(), holder);
    await addCard(holder, 'Regalia Gold');
    const results = await openResults(page);
    const button = results.getByRole('group', { name: 'HDFC Bank credit card, Regalia Gold', exact: true }).getByRole('button');
    await expect(button).toHaveCount(1);
    await expectReminderAboveButton(page, button);
    await captureWidths(page, 'contact-search-results');
    const message = 'Hi Meera Shah, I saw on CreditWithFriends (creditwithfriends.in) that you have an HDFC Bank credit card, Regalia Gold. Do you have a moment? I need it for an offer.';
    await exercisePress(page, button, results.getByRole('button', { name: 'Change search', exact: true }), `https://wa.me/919876543210?text=${encodeURIComponent(message)}`);
  } finally { await holder.close(); }
});

test('done-when-3: a circle member card checks its card and opens WhatsApp without a stated variant', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const holder = await browser.newContext();
  try {
    await member(page.context(), 'Shopper');
    await member(holder, 'Meera Shah');
    await sharedCircle(page.context(), holder);
    await addCard(holder);
    const cards = await openMemberCards(page);
    const button = cards.getByRole('button');
    await expect(button).toHaveCount(1);
    await expectReminderAboveButton(page, button);
    await captureWidths(page, 'contact-member-cards');
    const message = 'Hi Meera Shah, I saw on CreditWithFriends (creditwithfriends.in) that you have an HDFC Bank credit card. Do you have a moment? I need it for an offer.';
    await exercisePress(page, button, page.getByRole('link', { name: 'Back to circle', exact: true }), `https://wa.me/919876543210?text=${encodeURIComponent(message)}`);
  } finally { await holder.close(); }
});

for (const screen of ['search', 'member'] as const) {
test(`done-when-4: a removed ${screen} card is unavailable while another card remains usable`, async ({ page, browser }) => {
  test.setTimeout(120_000);
  const holder = await browser.newContext();
  try {
    await member(page.context(), 'Shopper');
    await member(holder, 'Meera Shah');
    await sharedCircle(page.context(), holder);
    const removedId = await addCard(holder, 'Regalia Gold');
    await addCard(holder, 'Millennia');
    const cards = screen === 'search' ? await openResults(page) : await openMemberCards(page);
    const removedCard = screen === 'search'
      ? cards.getByRole('group', { name: 'HDFC Bank credit card, Regalia Gold', exact: true })
      : cards.getByRole('listitem').filter({ hasText: 'Regalia Gold' });
    const currentCard = screen === 'search'
      ? cards.getByRole('group', { name: 'HDFC Bank credit card, Millennia', exact: true })
      : cards.getByRole('listitem').filter({ hasText: 'Millennia' });
    const removedButton = removedCard.getByRole('button', { name: 'Message on WhatsApp' });
    const currentButton = currentCard.getByRole('button', { name: 'Message on WhatsApp' });
    await expect(removedButton).toBeVisible();
    await expect(currentButton).toBeVisible();
    const navigations: string[] = [];
    await page.context().route('https://wa.me/**', (route) => { navigations.push(route.request().url()); return route.abort(); });
    expect((await holder.request.delete(`${API}/me/cards/${removedId}`, { headers: HEADERS })).ok()).toBeTruthy();
    await removedButton.click();
    await expect(removedCard.getByRole('alert')).toHaveText('This card is no longer available.');
    await expect(removedButton).toBeDisabled();
    await expect(currentButton).toBeEnabled();
    expect(navigations).toEqual([]);
    await currentButton.click();
    const message = 'Hi Meera Shah, I saw on CreditWithFriends (creditwithfriends.in) that you have an HDFC Bank credit card, Millennia. Do you have a moment? I need it for an offer.';
    await expect.poll(() => navigations).toEqual([`https://wa.me/919876543210?text=${encodeURIComponent(message)}`]);
  } finally { await holder.close(); }
});
}

test('done-when-4: leaving the shared circle makes a still-listed member card unavailable', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const holder = await browser.newContext();
  try {
    await member(page.context(), 'Shopper');
    await member(holder, 'Meera Shah');
    const circleId = await sharedCircle(page.context(), holder);
    await addCard(holder, 'Regalia Gold');
    const cards = await openMemberCards(page);
    const button = cards.getByRole('button', { name: 'Message on WhatsApp' });
    await expect(button).toBeEnabled();
    const navigations: string[] = [];
    await page.context().route('https://wa.me/**', (route) => { navigations.push(route.request().url()); return route.abort(); });
    expect((await holder.request.post(`${API}/circles/${circleId}/leave`, { headers: HEADERS })).ok()).toBeTruthy();
    await button.click();
    await expect(cards.getByRole('alert')).toHaveText('This card is no longer available.');
    await expect(button).toBeDisabled();
    expect(navigations).toEqual([]);
  } finally { await holder.close(); }
});

test('done-when-3: an expired session and a required privacy notice return to the card screen', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const holder = await browser.newContext();
  try {
    await member(page.context(), 'Shopper');
    await member(holder, 'Meera Shah');
    await sharedCircle(page.context(), holder);
    await addCard(holder, 'Regalia Gold');
    const results = await openResults(page);
    await page.route('**/api/v1/contacts', (route) => route.fulfill({
      status: 401, contentType: 'application/json',
      body: JSON.stringify({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in again.', details: null, errorId: randomUUID() } }),
    }));
    await results.getByRole('button', { name: 'Message on WhatsApp' }).click();
    await expect(page).toHaveURL(/\/session\?/);
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/search');

    await page.unroute('**/api/v1/contacts');
    const cards = await openMemberCards(page);
    const memberPath = new URL(page.url()).pathname;
    await page.route('**/api/v1/contacts', (route) => route.fulfill({
      status: 403, contentType: 'application/json',
      body: JSON.stringify({ success: false, data: null, error: { code: 'PRIVACY_NOTICE_REQUIRED', message: 'Review the privacy notice.', details: null, errorId: randomUUID() } }),
    }));
    await cards.getByRole('button', { name: 'Message on WhatsApp' }).click();
    await expect(page).toHaveURL(/\/notice\?/);
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(memberPath);
  } finally { await holder.close(); }
});
