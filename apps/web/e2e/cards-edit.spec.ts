import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Locator } from '@playwright/test';

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

async function addCard(page: Page, variant = 'Millennia') {
  const response = await page.request.post(`${API}/me/cards`, { data: { bankId: 'hdfc-bank', type: 'credit', variant }, headers: HEADERS });
  expect(response.status()).toBe(201);
  return (await response.json()).data as { id: string };
}

async function saveResponse(page: Page, id: string) {
  const response = page.waitForResponse((response) => response.url() === `${API}/me/cards/${id}` && response.request().method() === 'PATCH');
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

test('done-when-1: follow Add a card from Your cards and see the saved card listed', async ({ page }) => {
  await member(page);
  await page.goto('/cards');
  await expect(page.getByRole('heading', { name: 'No cards yet' })).toBeVisible();
  const add = page.getByRole('link', { name: 'Add a card', exact: true });
  await expect(add).toHaveAttribute('href', '/cards/add');
  await page.getByRole('link', { name: 'Back to your circles' }).focus();
  await page.keyboard.press('Tab');
  await expect(add).toBeFocused();
  await capture(page, 'empty-list-add');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/cards/add');
  await page.getByLabel('Bank', { exact: true }).selectOption('hdfc-bank');
  await page.getByLabel('Card type').selectOption('credit');
  await page.getByLabel('Variant (optional)').fill('Millennia');
  const response = page.waitForResponse((response) => response.url() === `${API}/me/cards` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await response).status()).toBe(201);
  await expect(page).toHaveURL('/cards');
  const list = page.getByRole('list', { name: 'Your cards' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('HDFC Bank');
  await expect(list).toContainText('Credit card');
  await expect(list).toContainText('Millennia');
  await expect(add).toBeVisible();
  await capture(page, 'populated-list-add');
});

test('done-when-3: open a listed card, edit every field with the keyboard and save while holding 20 cards', async ({ page }) => {
  await member(page);
  const card = await addCard(page);
  for (const variant of 'ABCDEFGHIJKLMNOPQRS') await addCard(page, variant);
  await page.goto('/cards');
  await expect(page.getByText('You can list at most 20 cards.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add a card', exact: true })).toHaveCount(0);
  const edit = page.getByRole('link', { name: 'Edit HDFC Bank credit card Millennia', exact: true });
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`/cards/${card.id}/edit`);
  await expect(page).toHaveTitle('Edit a card | CreditWithFriends');
  await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
  const bank = page.getByLabel('Bank', { exact: true });
  const variant = page.getByLabel('Variant (optional)');
  await expect(bank).toHaveValue('hdfc-bank');
  await expect(variant).toHaveValue('Millennia');
  await page.getByRole('link', { name: 'Back to your cards' }).focus();
  await page.keyboard.press('Tab');
  await expect(bank).toBeFocused();
  await bank.selectOption({ label: 'Scapia (Federal Bank)' });
  await bank.focus();
  for (const [value, type, name] of [
    ['Jupiter Edge:csb-bank', 'credit', 'Jupiter Edge'],
    ['Jupiter Edge:federal-bank', 'credit', 'Jupiter Edge'],
    ['Jupiter debit card:federal-bank', 'debit', 'Jupiter'],
  ]) {
    await page.keyboard.press('ArrowDown');
    await expect(bank).toBeFocused();
    await expect(bank).toHaveValue(value);
    await expect(page.getByLabel('Card type')).toHaveValue(type);
    await expect(variant).toHaveValue(name);
  }
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Card type')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(variant).toBeFocused();
  await variant.fill('My Jupiter');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Leave without saving this card?');
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'Back to your cards' }).click();
  await expect(page).toHaveURL(`/cards/${card.id}/edit`);
  await expect(variant).toHaveValue('My Jupiter');
  await capture(page, 'edit-ready');
  const response = await saveResponse(page, card.id);
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toEqual({ bankId: 'federal-bank', type: 'debit', variant: 'My Jupiter' });
  await expect(page).toHaveURL('/cards');
  await expect(page.getByRole('list', { name: 'Your cards' }).getByRole('listitem')).toHaveCount(20);
  await expect(page.getByRole('link', { name: 'Edit Federal Bank debit card My Jupiter' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit HDFC Bank credit card Millennia', exact: true })).toHaveCount(0);
});

async function fieldRefusal(page: Page, id: string, field: Locator, code: string, message: string) {
  const response = await saveResponse(page, id);
  expect((await response.json()).error).toMatchObject({ code, message });
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(message);
  await expect(field).toBeFocused();
  const error = page.getByRole('alert');
  await expect(error).toHaveText(message);
  // The description must also be visually next to its field, not just linked by ARIA.
  await expect(field.locator('..').getByRole('alert')).toHaveText(message);
  await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
}

test('done-when-3: edit refusals sit beside their field and a duplicate of another card sits above Save', async ({ page }) => {
  await member(page);
  const card = await addCard(page);
  await addCard(page, 'Regalia');
  await page.goto(`/cards/${card.id}/edit`);
  const bank = page.getByLabel('Bank', { exact: true });
  const variant = page.getByLabel('Variant (optional)');
  await expect(bank).toBeVisible();
  // A stale picker entry still goes to the real API for its refusal.
  await bank.evaluate((element: HTMLSelectElement) => element.add(new Option('Retired bank', 'retired-bank')));
  await bank.selectOption('retired-bank');
  await fieldRefusal(page, card.id, bank, 'CARD_BANK_UNKNOWN', 'Choose a bank from the list.');
  await bank.selectOption('hdfc-bank');
  await variant.fill('A'.repeat(41));
  await fieldRefusal(page, card.id, variant, 'CARD_VARIANT_TOO_LONG', 'Use at most 40 characters.');
  await variant.fill('1-2-3');
  await fieldRefusal(page, card.id, variant, 'CARD_VARIANT_UNSAFE', 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.');
  await capture(page, 'variant-refusal');
  await variant.fill(' regalia ');
  const response = await saveResponse(page, card.id);
  expect(response.status()).toBe(409);
  expect((await response.json()).error).toMatchObject({ code: 'CARD_DUPLICATE', message: "You've already listed this card." });
  const error = page.getByRole('alert');
  await expect(error).toHaveText("You've already listed this card.");
  await expect(error).toBeFocused();
  await expect(bank).toHaveAttribute('aria-invalid', 'false');
  await expect(variant).toHaveAttribute('aria-invalid', 'false');
  const errorBox = await error.boundingBox();
  const saveBox = await page.getByRole('button', { name: 'Save', exact: true }).boundingBox();
  expect(errorBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  expect(errorBox!.y + errorBox!.height).toBeLessThanOrEqual(saveBox!.y);
  await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
  const unchanged = await page.request.get(`${API}/me/cards`);
  expect((await unchanged.json()).data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: card.id, variant: 'Millennia' })]));
  await capture(page, 'duplicate-refusal');
  // Correction clears the error and saving an empty variant clears the old value.
  await variant.fill('');
  await expect(error).toHaveCount(0);
  expect((await saveResponse(page, card.id)).status()).toBe(200);
  await expect(page).toHaveURL('/cards');
  await page.getByRole('link', { name: 'Edit HDFC Bank credit card', exact: true }).click();
  await expect(variant).toHaveValue('');
});

test('done-when-3: unknown and another member’s card show the same not-found state', async ({ page }) => {
  await member(page);
  const privateCard = await addCard(page, 'Private card');
  await member(page);
  await addCard(page, 'My card');
  let notFound = '';
  for (const id of [randomUUID(), privateCard.id]) {
    await page.goto(`/cards/${id}/edit`);
    await expect(page.getByRole('heading', { name: 'Card not found' })).toBeVisible();
    await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove card' })).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(page.getByText('Private card')).toHaveCount(0);
    const message = await page.getByRole('alert').innerText();
    if (notFound) expect(message).toBe(notFound);
    notFound = message;
  }
  await page.getByRole('link', { name: 'Back to your cards' }).click();
  await expect(page.getByRole('list', { name: 'Your cards' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Edit HDFC Bank credit card My card' })).toBeVisible();
});

test('done-when-3: failed card and bank loads keep the reminder, disable Save and recover on retry', async ({ page }) => {
  await member(page);
  const card = await addCard(page);
  for (const [path, heading] of [['**/api/v1/me/cards', 'We couldn’t load your card'], ['**/api/v1/banks?*', 'We couldn’t load the banks']] as const) {
    await page.route(path, (route) => route.abort('internetdisconnected'));
    await page.goto(`/cards/${card.id}/edit`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText('Check your connection and try again.')).toBeVisible();
    await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await capture(page, path.includes('banks') ? 'banks-unavailable' : 'card-unavailable');
    await page.unroute(path);
    const retry = page.getByRole('button', { name: 'Try again' });
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Bank', { exact: true })).toHaveValue('hdfc-bank');
    await expect(page.getByLabel('Variant (optional)')).toHaveValue('Millennia');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});

test('done-when-3: removing asks first, cancelling keeps the card, and a failed removal can be retried', async ({ page }) => {
  await member(page);
  const card = await addCard(page);
  await addCard(page, 'Keep this card');
  await page.goto(`/cards/${card.id}/edit`);
  const remove = page.getByRole('button', { name: 'Remove card', exact: true });
  await expect(remove).toBeVisible();
  await page.getByLabel('Variant (optional)').fill('Unsaved change');
  let deletes = 0;
  page.on('request', (request) => { if (request.method() === 'DELETE') deletes += 1; });
  const warning = 'Remove HDFC Bank credit card Millennia? This permanently removes it from your cards. You can add it again later.';
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toBe(warning);
    await dialog.dismiss();
  });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Variant (optional)')).toHaveValue('Unsaved change');
  expect(deletes).toBe(0);
  const retained = await page.request.get(`${API}/me/cards`);
  expect((await retained.json()).data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: card.id, variant: 'Millennia' })]));
  const url = `${API}/me/cards/${card.id}`;
  await page.route(url, (route) => route.request().method() === 'DELETE' ? route.abort('internetdisconnected') : route.continue());
  page.once('dialog', (dialog) => dialog.accept());
  await remove.click();
  await expect(page.getByRole('alert')).toHaveText('We couldn’t remove your card. Check your connection and try again.');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(remove).toBeEnabled();
  await expect(page.getByText(REMINDER, { exact: true })).toBeVisible();
  await page.unroute(url);
  page.once('dialog', async (dialog) => { expect(dialog.message()).toBe(warning); await dialog.accept(); });
  const response = page.waitForResponse((response) => response.url() === url && response.request().method() === 'DELETE');
  await remove.focus();
  await page.keyboard.press('Enter');
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL('/cards');
  await expect(page.getByRole('list', { name: 'Your cards' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Edit HDFC Bank credit card Millennia', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit HDFC Bank credit card Keep this card' })).toBeVisible();
  const listed = await page.request.get(`${API}/me/cards`);
  expect((await listed.json()).data.items).toMatchObject([{ variant: 'Keep this card' }]);
});
