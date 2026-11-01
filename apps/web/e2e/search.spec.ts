import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const API = 'http://localhost:3104/api/v1';
const HEADERS = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };

async function member(context: BrowserContext, displayName: string) {
  const signedIn = await context.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: displayName }, headers: HEADERS,
  });
  expect(signedIn.ok()).toBeTruthy();
  const session = signedIn.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await context.addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  const onboarded = await context.request.post(`${API}/onboarding`, {
    data: { displayName, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers: HEADERS,
  });
  expect(onboarded.ok()).toBeTruthy();
}

async function circle(owner: BrowserContext, name: string, members: BrowserContext[]) {
  const created = await owner.request.post(`${API}/circles`, { data: { name }, headers: HEADERS });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.id as string;
  const invite = await owner.request.get(`${API}/circles/${id}/invite`);
  expect(invite.ok()).toBeTruthy();
  const code = ((await invite.json()).data.url as string).split('/').at(-1);
  expect(code).toBeDefined();
  for (const memberContext of members) {
    expect((await memberContext.request.post(`${API}/circle-invites/${code}/join`, { headers: HEADERS })).ok()).toBeTruthy();
  }
}

async function card(holder: BrowserContext, bankId: string, type: 'credit' | 'debit', variant?: string) {
  const added = await holder.request.post(`${API}/me/cards`, {
    data: { bankId, type, ...(variant === undefined ? {} : { variant }) }, headers: HEADERS,
  });
  expect(added.status(), await added.text()).toBe(201);
}

async function openSearch(page: Page) {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Find a card', exact: true });
  await expect(link).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Your account' }).getByRole('link')).toHaveText(['Find a card', 'Your cards', 'Your profile']);
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Find a card', exact: true })).toBeVisible();
}

async function captureWidths(page: Page, state: string) {
  for (const [name, width, height] of [['phone', 375, 844], ['tablet', 768, 1024], ['desktop', 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: test.info().outputPath(`${state}-${name}.png`), fullPage: true, scale: 'css' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 844 });
}

test('done-when-1: home search finds ordered circle members, pages, retries and restores results', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  try {
    await member(page.context(), 'Shopper');
    async function holder(name: string) {
      const context = await browser.newContext();
      contexts.push(context);
      await member(context, name);
      return context;
    }
    const asha = await holder('Asha');
    const meera = await holder('Meera');
    const rohan = await holder('Rohan');
    const outsider = await holder('Outsider');
    await circle(page.context(), 'Family', [asha, meera]);
    await circle(page.context(), 'Office friends', [meera, rohan]);
    await card(asha, 'hdfc-bank', 'credit', 'Millennia');
    await card(asha, 'hdfc-bank', 'credit', 'Swiggy');
    await card(meera, 'hdfc-bank', 'credit', 'Regalia Gold');
    await card(meera, 'hdfc-bank', 'debit');
    await card(rohan, 'hdfc-bank', 'debit');
    await card(outsider, 'hdfc-bank', 'credit');
    await card(page.context(), 'hdfc-bank', 'credit');

    // The browser still asks for 100; a real smaller API page exercises Show more.
    await page.route('**/api/v1/searches?*', (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('limit', '2');
      return route.continue({ url: url.toString() });
    });
    const searches: Array<{ page: string | null; limit: string | null; body: unknown; requestedWith: string | undefined }> = [];
    const searchAddresses: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/v1/searches') return;
      const url = new URL(request.url());
      searchAddresses.push(url.href);
      searches.push({ page: url.searchParams.get('page'), limit: url.searchParams.get('limit'), body: request.postDataJSON(), requestedWith: request.headers()['x-requested-with'] });
    });
    await openSearch(page);
    const bank = page.getByLabel('Bank or brand card');
    await expect(bank).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Credit or debit', exact: true })).toBeChecked();
    await bank.selectOption('hdfc-bank');
    await bank.focus();
    expect(await bank.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('radio', { name: 'Credit or debit', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Variant (optional)')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeFocused();
    await captureWidths(page, 'search-form');
    await page.getByRole('radio', { name: 'Credit or debit', exact: true }).check();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('heading', { name: 'Asha' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Meera' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Rohan' })).toHaveCount(0);
    await expect(results.getByRole('heading', { name: 'Shopper' })).toHaveCount(0);
    await expect(results.getByRole('heading', { name: 'Outsider' })).toHaveCount(0);
    await expect(results.getByRole('button', { name: 'Show more' })).toBeVisible();
    await results.getByRole('button', { name: 'Show more' }).click();
    await expect(results.getByRole('heading', { name: 'Rohan' })).toBeVisible();
    await expect(results.getByRole('button', { name: 'Show more' })).toHaveCount(0);
    expect(await results.locator('h3').allTextContents()).toEqual(['Asha', 'Meera', 'Rohan']);
    await expect(results.getByText('Family')).toHaveCount(2);
    await expect(results.getByText('Office friends')).toHaveCount(2);
    await expect(results.getByText('Regalia Gold')).toBeVisible();
    await expect(results.getByText('Millennia')).toBeVisible();
    expect(searches.slice(0, 2)).toEqual([
      { page: '1', limit: '100', body: { bankId: 'hdfc-bank', type: 'any' }, requestedWith: 'cwf' },
      { page: '2', limit: '100', body: { bankId: 'hdfc-bank', type: 'any' }, requestedWith: 'cwf' },
    ]);

    const countBeforeReturn = searches.length;
    await page.goto('about:blank');
    await page.goBack();
    await expect(results.getByRole('heading', { name: 'Rohan' })).toBeVisible();
    // A new document must restore too; browser back/forward caching alone is not proof.
    await page.reload();
    await expect(results.getByRole('heading', { name: 'Rohan' })).toBeVisible();
    expect(searches).toHaveLength(countBeforeReturn);
    await captureWidths(page, 'search-results');
    await results.getByRole('button', { name: 'Change search' }).click();
    await expect(bank).toBeFocused();

    await page.getByRole('radio', { name: 'Debit', exact: true }).check();
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(results.getByRole('heading', { name: 'Meera' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Rohan' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Asha' })).toHaveCount(0);
    expect(searches.at(-1)?.body).toEqual({ bankId: 'hdfc-bank', type: 'debit' });

    await bank.selectOption({ label: 'Swiggy (HDFC Bank)' });
    await expect(page.getByRole('radio', { name: 'Credit', exact: true })).toBeChecked();
    await expect(page.getByLabel('Variant (optional)')).toHaveValue('Swiggy');
    // The shortcut itself must find its holder before any filled field is edited.
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(results.getByRole('heading', { name: 'Matching variant', exact: true })).toBeVisible();
    await expect(results.locator('h3')).toHaveText(['Asha']);
    await expect(results.getByText('Swiggy', { exact: true })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Similar variant', exact: true })).toHaveCount(0);
    await expect(results.getByRole('heading', { name: 'Variant not stated', exact: true })).toHaveCount(0);
    expect(searches.at(-1)?.body).toEqual({ bankId: 'hdfc-bank', type: 'credit', variant: 'Swiggy' });
    await page.getByLabel('Variant (optional)').fill('Regalia');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(results.getByRole('heading', { name: 'Meera' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Asha' })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.has('variant')).toBe(false);
    expect(page.url()).not.toContain('Regalia');
    expect(searches.at(-1)?.body).toEqual({ bankId: 'hdfc-bank', type: 'credit', variant: 'Regalia' });
    for (const address of searchAddresses) expect([...new URL(address).searchParams.keys()].sort()).toEqual(['limit', 'page']);

    let failOnce = true;
    await page.route('**/api/v1/searches?*', (route) => {
      if (failOnce) { failOnce = false; return route.abort('internetdisconnected'); }
      return route.continue();
    });
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('try again');
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(results.getByRole('heading', { name: 'Meera' })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test('done-when-2: variant groups, empty results and card-detail refusals are visible in search', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const contexts: BrowserContext[] = [];
  try {
    await member(page.context(), 'Shopper');
    for (const name of ['Z exact', 'A near', 'B unstated']) {
      const context = await browser.newContext();
      contexts.push(context);
      await member(context, name);
    }
    await circle(page.context(), 'Friends', contexts);
    await card(contexts[0], 'hdfc-bank', 'credit', 'Flip-Kart');
    await card(contexts[0], 'hdfc-bank', 'credit', 'flpkat');
    await card(contexts[0], 'hdfc-bank', 'credit');
    await card(contexts[1], 'hdfc-bank', 'credit', 'flipkat');
    await card(contexts[2], 'hdfc-bank', 'credit');
    await openSearch(page);
    const bank = page.getByLabel('Bank or brand card');
    const variant = page.getByLabel('Variant (optional)');
    const results = page.getByRole('region', { name: 'Search results' });
    await bank.selectOption('hdfc-bank');
    await page.getByRole('radio', { name: 'Credit', exact: true }).check();
    await variant.fill('flip kart');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(results.getByRole('heading', { name: 'Matching variant' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Similar variant' })).toBeVisible();
    await expect(results.getByRole('heading', { name: 'Variant not stated' })).toBeVisible();
    expect(await results.locator('h3').allTextContents()).toEqual(['Z exact', 'A near', 'B unstated']);
    await expect(results.getByText('Flip-Kart')).toBeVisible();
    await expect(results.getByText('flpkat', { exact: true })).toHaveCount(1);
    await expect(results.getByText('flipkat', { exact: true })).toHaveCount(1);
    const exactPerson = results.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Z exact', exact: true }) });
    await expect(exactPerson.getByText('No variant', { exact: true })).toBeVisible();
    await expect(exactPerson.getByText('Flip-Kart', { exact: true })).toBeVisible();
    await expect(exactPerson.getByText('flpkat', { exact: true })).toBeVisible();
    await captureWidths(page, 'search-variant-groups');

    await variant.fill('!!!');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(results.getByRole('heading', { name: 'Matching variant' })).toHaveCount(0);
    await expect(results.getByRole('heading', { name: 'Similar variant' })).toHaveCount(0);
    await expect(results.getByRole('heading', { name: 'Variant not stated' })).toHaveCount(0);
    await expect(results.locator('h3')).toHaveText(['A near', 'B unstated', 'Z exact']);

    await bank.selectOption('axis-bank');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(results).toHaveText('No one in your circles has this card yet.');
    await expect(results.getByRole('heading', { name: /variant/i })).toHaveCount(0);
    await bank.selectOption('hdfc-bank');
    await bank.evaluate((element: HTMLSelectElement) => element.add(new Option('Retired bank', 'retired-bank')));
    await bank.selectOption('retired-bank');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(bank).toHaveAccessibleDescription('Choose a bank from the list.');
    await expect(bank).toHaveAttribute('aria-invalid', 'true');
    await bank.selectOption('hdfc-bank');
    await variant.fill('A'.repeat(41));
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(variant).toHaveAccessibleDescription('Use at most 40 characters.');
    await variant.fill('4111 1111 1111 1111');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(variant).toHaveAccessibleDescription('This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.');
    await expect(variant).toHaveAttribute('aria-invalid', 'true');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
