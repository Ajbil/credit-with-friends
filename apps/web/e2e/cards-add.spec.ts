import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:3104/api/v1';
const HEADERS = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };
const REMINDER = 'Never enter card numbers, CVV, expiry dates or OTPs.';

async function member(page: Page) {
  const signIn = await page.request.post('http://127.0.0.1:3104/api/v1/test-auth/sign-in', {
    data: { googleAccountId: randomUUID(), email: 'listed@example.in', name: 'Card Holder' }, headers: HEADERS,
  });
  expect(signIn.ok()).toBeTruthy();
  const session = signIn.headers()['set-cookie']?.match(/^cwf_session=([^;]+)/)?.[1];
  expect(session).toBeDefined();
  await page.context().addCookies([{ name: 'cwf_session', value: session!, domain: 'localhost', path: '/api/v1', httpOnly: true, sameSite: 'Lax' }]);
  expect((await page.request.post(`${API}/onboarding`, {
    data: { displayName: 'Card Holder', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, headers: HEADERS,
  })).ok()).toBeTruthy();
}

async function saveResponse(page: Page) {
  const response = page.waitForResponse((response) => response.url() === `${API}/me/cards` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  return response;
}

async function capture(page: Page, state: string) {
  for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1280, 900]] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: test.info().outputPath(`${state}-${name}.png`), fullPage: true, scale: 'css' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('done-when-1: pick Jupiter debit, change every filled field and save outside a circle', async ({ page }) => {
  await member(page);
  await page.goto('/cards');
  await expect(page.getByText('No cards yet')).toBeVisible();
  await page.goto('/cards/add');
  await expect(page.getByRole('heading', { name: 'Add a card', exact: true })).toBeVisible();
  await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Add a card | CreditWithFriends');
  await page.getByRole('link', { name: 'Back to your cards' }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Bank', { exact: true })).toBeFocused();
  await page.getByLabel('Bank', { exact: true }).selectOption({ label: 'Jupiter debit card (Federal Bank)' });
  // A shortcut stays selected; its bank ID is sent separately when saving.
  await expect(page.getByLabel('Bank', { exact: true })).toHaveValue('Jupiter debit card:federal-bank');
  await expect(page.getByLabel('Card type')).toHaveValue('debit');
  await expect(page.getByLabel('Variant (optional)')).toHaveValue('Jupiter');
  await page.getByLabel('Bank', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Card type')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Variant (optional)')).toBeFocused();
  await page.getByLabel('Bank', { exact: true }).selectOption({ label: 'HDFC Bank' });
  await expect(page.getByLabel('Bank', { exact: true }).locator('option:checked')).toHaveText('HDFC Bank');
  await page.getByLabel('Card type').selectOption('credit');
  await page.getByLabel('Variant (optional)').fill('Millennia');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Leave without saving this card?');
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'Back to your cards' }).click();
  await expect(page).toHaveURL('/cards/add');
  await expect(page.getByLabel('Variant (optional)')).toHaveValue('Millennia');
  await capture(page, 'add-ready');
  expect((await saveResponse(page)).status()).toBe(201);
  await expect(page).toHaveURL('/cards');
  const saved = page.getByRole('list', { name: 'Your cards' }).getByRole('listitem');
  await expect(saved).toHaveCount(1);
  await expect(saved).toContainText('HDFC Bank');
  await expect(saved).toContainText('Credit card');
  await expect(saved).toContainText('Millennia');
});

test('done-when-1: ArrowDown browses consecutive brand shortcuts and saves the selected card', async ({ page }) => {
  await member(page);
  await page.goto('/cards/add');
  const picker = page.getByLabel('Bank', { exact: true });
  await picker.selectOption({ label: 'Scapia (Federal Bank)' });
  await picker.focus();
  for (const [label, value, type, variant] of [
    ['Jupiter Edge (CSB Bank)', 'Jupiter Edge:csb-bank', 'credit', 'Jupiter Edge'],
    ['Jupiter Edge (Federal Bank)', 'Jupiter Edge:federal-bank', 'credit', 'Jupiter Edge'],
    ['Jupiter debit card (Federal Bank)', 'Jupiter debit card:federal-bank', 'debit', 'Jupiter'],
  ]) {
    await page.keyboard.press('ArrowDown');
    await expect(picker).toBeFocused();
    await expect(picker).toHaveValue(value);
    await expect(picker.locator('option:checked')).toHaveText(label);
    await expect(page.getByLabel('Card type')).toHaveValue(type);
    await expect(page.getByLabel('Variant (optional)')).toHaveValue(variant);
  }
  const response = await saveResponse(page);
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toEqual({ bankId: 'federal-bank', type: 'debit', variant: 'Jupiter' });
  await expect(page).toHaveURL('/cards');
  const saved = page.getByRole('list', { name: 'Your cards' }).getByRole('listitem');
  await expect(saved).toHaveCount(1);
  await expect(saved).toContainText('Federal Bank');
  await expect(saved).toContainText('Debit card');
  await expect(saved).toContainText('Jupiter');
});

async function fieldRefusal(page: Page, field: Locator, code: string, message: string) {
  const response = await saveResponse(page);
  expect((await response.json()).error).toMatchObject({ code, message });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(message);
  await expect(page.getByRole('alert')).toHaveText(message);
  await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
}

test('done-when-2: API refusals stay beside bank or variant, or above Save for duplicates and the limit', async ({ page }) => {
  await member(page);
  await page.goto('/cards/add');
  const bank = page.getByLabel('Bank', { exact: true });
  const variant = page.getByLabel('Variant (optional)');
  await expect(bank).toBeVisible();
  // Simulate a stale picker entry while the real API owns the refusal.
  await bank.evaluate((element: HTMLSelectElement) => element.add(new Option('Retired bank', 'retired-bank')));
  await bank.selectOption('retired-bank');
  await fieldRefusal(page, bank, 'CARD_BANK_UNKNOWN', 'Choose a bank from the list.');
  await bank.selectOption('hdfc-bank');
  await variant.fill('A'.repeat(41));
  await fieldRefusal(page, variant, 'CARD_VARIANT_TOO_LONG', 'Use at most 40 characters.');
  await variant.fill('1-2-3');
  await fieldRefusal(page, variant, 'CARD_VARIANT_UNSAFE', 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.');
  await capture(page, 'variant-refusal');
  await variant.fill('Millennia');
  expect((await saveResponse(page)).status()).toBe(201);
  await expect(page).toHaveURL('/cards');
  await page.goto('/cards/add');
  await bank.selectOption('hdfc-bank');
  await variant.fill('Millennia');
  for (const [code, message] of [['CARD_DUPLICATE', "You've already listed this card."], ['CARD_LIMIT', 'You can list at most 20 cards.']] as const) {
    const response = await saveResponse(page);
    expect((await response.json()).error).toMatchObject({ code, message });
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText(message);
    await expect(bank).toHaveAttribute('aria-invalid', 'false');
    await expect(variant).toHaveAttribute('aria-invalid', 'false');
    const alertBox = await alert.boundingBox();
    const saveBox = await page.getByRole('button', { name: 'Save', exact: true }).boundingBox();
    expect(alertBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    expect(alertBox!.y + alertBox!.height).toBeLessThanOrEqual(saveBox!.y);
    await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
    if (code === 'CARD_DUPLICATE') {
      for (const name of 'ABCDEFGHIJKLMNOPQRS') expect((await page.request.post(`${API}/me/cards`, { data: { bankId: 'hdfc-bank', type: 'credit', variant: name }, headers: HEADERS })).status()).toBe(201);
      await variant.fill('Another card');
    }
  }
  await capture(page, 'card-limit');
});

test('done-when-7: requesting a missing bank shows the contact and encodes the email request', async ({ page }) => {
  await member(page);
  await page.goto('/cards/add');
  const response = await page.request.get(`${API}/banks?page=1&limit=100`);
  expect(response.ok()).toBeTruthy();
  const { contactEmail } = (await response.json()).data;
  const request = page.getByRole('link', { name: 'Bank not listed? Ask us to add it' });
  await expect(request).toBeVisible();
  const href = await request.getAttribute('href');
  expect(href).not.toBeNull();
  const email = new URL(href!);
  expect(email.protocol).toBe('mailto:');
  expect(decodeURIComponent(email.pathname)).toBe(contactEmail);
  expect(email.searchParams.get('subject')).toBe('Please add my bank');
  expect(email.searchParams.get('body')).toBe('Bank name: ');
  expect(href).toContain('subject=Please%20add%20my%20bank');
  expect(href).toContain('body=Bank%20name%3A%20');
  await expect(page.getByText(contactEmail, { exact: true })).toBeVisible();
});

test('done-when-1: a failed bank load offers retry without a partial picker or enabled Save', async ({ page }) => {
  await member(page);
  // Interrupt the real transport; do not replace the bank service with a fake list.
  await page.route('**/api/v1/banks?*', (route) => route.abort('internetdisconnected'));
  await page.goto('/cards/add');
  await expect(page.getByRole('alert')).toContainText('We couldn’t load the banks');
  await expect(page.getByText('Check your connection and try again.')).toBeVisible();
  await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await capture(page, 'banks-unavailable');
  await page.unroute('**/api/v1/banks?*');
  const retry = page.getByRole('button', { name: 'Try again' });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Bank', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Bank', { exact: true })).toBeFocused();
  await page.getByLabel('Bank', { exact: true }).selectOption('federal-bank');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('done-when-1 and 7: all shortcut issuers are live banks and a bank rename updates shortcut labels', async ({ page }) => {
  await member(page);
  // Bank-name corrections ship as migrations, so only this reference-data correction
  // uses SQL; members and their cards are always created through the running API.
  const db = new PrismaClient({ datasources: { db: { url: process.env.CWF_WEB_TEST_DATABASE_URL } } });
  const original = await db.bank.findUniqueOrThrow({ where: { id: 'federal-bank' } });
  try {
    await db.bank.update({ where: { id: 'federal-bank' }, data: { displayName: 'Federal Bank (corrected)' } });
    const banksResponse = await page.request.get(`${API}/banks?page=1&limit=100`);
    expect(banksResponse.ok()).toBeTruthy();
    const banks: Array<{ id: string; displayName: string }> = (await banksResponse.json()).data.items;
    const { CARD_SHORTCUTS } = await import('../src/routes/cards/add/card-shortcuts');
    for (const shortcut of CARD_SHORTCUTS) expect(banks.map(({ id }) => id)).toContain(shortcut.bankId);
    const request = page.waitForRequest((request) => new URL(request.url()).pathname === '/api/v1/banks');
    await page.goto('/cards/add');
    const query = new URL((await request).url()).searchParams;
    expect(query.get('page')).toBe('1');
    expect(query.get('limit')).toBe('100');
    const picker = page.getByLabel('Bank', { exact: true });
    for (const shortcut of CARD_SHORTCUTS) {
      const bank = banks.find(({ id }) => id === shortcut.bankId)!;
      await expect(picker.getByRole('option', { name: `${shortcut.brand} (${bank.displayName})`, exact: true })).toHaveCount(1);
    }
    await picker.selectOption({ label: 'Jupiter debit card (Federal Bank (corrected))' });
    await expect(picker).toHaveValue('Jupiter debit card:federal-bank');
    await expect(picker.locator('option:checked')).toHaveText('Jupiter debit card (Federal Bank (corrected))');
  } finally {
    await db.bank.update({ where: { id: 'federal-bank' }, data: { displayName: original.displayName } });
    await db.$disconnect();
  }
});

test('done-when-1: shortcuts whose bank is absent from the returned list are hidden', async ({ page }) => {
  await member(page);
  // Ask the real bank service for a smaller page to exercise an incomplete catalog.
  // The server still supplies every bank and name; no response is fabricated.
  await page.route('**/api/v1/banks?*', (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set('limit', '1');
    return route.continue({ url: url.toString() });
  });
  await page.goto('/cards/add');
  const bank = page.getByLabel('Bank', { exact: true });
  await expect(bank.getByRole('option', { name: 'Airtel Payments Bank', exact: true })).toHaveCount(1);
  await expect(bank.getByRole('option', { name: /Jupiter|OneCard|Scapia|superCard/ })).toHaveCount(0);
  await expect(bank.locator('optgroup[label="Popular brand cards"] option')).toHaveCount(0);
});

for (const [name, returnTo, destination] of [
  ['same-site path', '/profile?from=cards#saved', '/profile?from=cards#saved'],
  ['outside URL', 'https://example.org/steal', '/cards'],
  ['protocol-relative URL', '//example.org/steal', '/cards'],
  ['backslash URL', '/\\example.org/steal', '/cards'],
] as const) {
  test(`done-when-1: saving handles the optional return path safely (${name})`, async ({ page }) => {
    await member(page);
    await page.goto(`/cards/add?returnTo=${encodeURIComponent(returnTo)}`);
    await page.getByLabel('Bank', { exact: true }).selectOption('federal-bank');
    await page.getByLabel('Card type').selectOption('debit');
    expect((await saveResponse(page)).status()).toBe(201);
    await expect(page).toHaveURL(destination);
    const listed = await page.request.get(`${API}/me/cards`);
    expect((await listed.json()).data.items).toMatchObject([{ bankId: 'federal-bank', type: 'debit', variant: null }]);
  });
}
