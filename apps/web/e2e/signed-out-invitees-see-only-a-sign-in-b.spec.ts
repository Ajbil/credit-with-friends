import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { expect, test } from '@playwright/test';

const api = 'http://localhost:3104/api/v1';
const headers = { origin: 'http://localhost:5173', 'x-requested-with': 'cwf' };

// The browser suite shares an API rate limit; this test owns a separate loopback client.
async function call(path: string, cookie = '', data?: unknown) {
  return new Promise<{ cookie: string; data: { id: string; url: string } }>((resolve, reject) => {
    const url = new URL(`${api}/${path}`);
    url.hostname = '127.0.0.1';
    const req = httpRequest(url, {
      method: data === undefined ? 'GET' : 'POST', localAddress: '127.21.0.200',
      headers: { ...headers, cookie, 'content-type': 'application/json' },
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
    req.on('error', reject);
    req.end(data === undefined ? undefined : JSON.stringify(data));
  });
}

async function invitePath() {
  const signedIn = await call('test-auth/sign-in', '', {
    googleAccountId: randomUUID(), email: 'listed@example.in', name: 'Private inviter', returnPath: '/',
  });
  const cookie = signedIn.cookie;
  expect(cookie).toMatch(/^cwf_session=/);
  await call('onboarding', cookie, {
    displayName: 'Private inviter', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1,
  });
  const circle = await call('circles', cookie, { name: 'Private family circle' });
  const invite = await call(`circles/${circle.data.id}/invite`, cookie);
  return new URL(invite.data.url).pathname;
}

test('signed-out invite explains the app and privacy before Google sign-in', async ({ page }) => {
  const path = await invitePath();
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: 'You’re invited to a circle on CreditWithFriends' })).toBeVisible();
  await expect(page.getByText('See which friends hold the card a shop’s offer needs, and ask them on WhatsApp in one tap. Card numbers are never shared.')).toBeVisible();
  await expect(page.getByText('Only people in your circles see which cards you hold. You sign in with Google, so we never see your password.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read our privacy notice' })).toHaveAttribute('href', '/privacy');
  await expect(page.getByText('Free · takes about a minute')).toBeVisible();
  const google = page.getByRole('link', { name: 'Continue with Google' });
  await expect(google).toBeVisible();
  expect(new URL((await google.getAttribute('href'))!).searchParams.get('returnTo')).toBe(path);
  await expect(page.getByText(/Private family circle|Private inviter|1 member/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('signed-out-mobile.png'), fullPage: true });
});

test('shared invite serves a public title, description and PNG preview', async ({ page }) => {
  await page.goto('/circles/join/private-circle-code');
  const metadata = await page.locator('head').evaluate((head) => {
    const content = (selector: string) => head.querySelector<HTMLMetaElement>(selector)?.content;
    return {
      title: content('meta[property="og:title"]'),
      description: content('meta[property="og:description"]'),
      pageDescription: content('meta[name="description"]'),
      type: content('meta[property="og:type"]'),
      siteName: content('meta[property="og:site_name"]'),
      image: content('meta[property="og:image"]'),
      width: content('meta[property="og:image:width"]'),
      height: content('meta[property="og:image:height"]'),
    };
  });
  expect(metadata).toEqual({
    title: 'CreditWithFriends',
    description: 'Find the card. Ask a friend. See which friends hold the card an offer needs, and ask on WhatsApp in one tap. Card numbers are never shared.',
    pageDescription: 'Find the card. Ask a friend. See which friends hold the card an offer needs, and ask on WhatsApp in one tap. Card numbers are never shared.',
    type: 'website', siteName: 'CreditWithFriends',
    image: 'https://creditwithfriends.in/invite-preview.png', width: '1200', height: '630',
  });
  const image = await page.request.get(new URL(metadata.image!).pathname);
  expect(image.ok()).toBeTruthy();
  expect(image.headers()['content-type']).toContain('image/png');
  expect((await image.body()).byteLength).toBeLessThan(300_000);
  expect(await page.evaluate(async () => {
    const image = new Image();
    image.src = '/invite-preview.png';
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  })).toEqual([1200, 630]);
});
