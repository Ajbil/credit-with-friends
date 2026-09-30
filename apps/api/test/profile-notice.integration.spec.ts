import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';

const origin = 'http://localhost:4173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_profile_test_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
let app: Awaited<ReturnType<typeof start>>;
let db: PrismaService;
let url: string;

async function start() {
  const [{ AppModule }, { configureApi }] = await Promise.all([import('../src/app.module'), import('../src/common/api/api.config')]);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const application = module.createNestApplication();
  configureApi(application, application.get(ConfigService<ApiConfig, true>));
  await application.listen(0, '127.0.0.1');
  return application;
}

async function call(path: string, method = 'GET', cookie = '', body?: unknown) {
  const headers: Record<string, string> = { cookie };
  if (method !== 'GET') Object.assign(headers, { origin, 'x-requested-with': 'cwf', 'content-type': 'application/json' });
  const response = await fetch(`${url}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, payload: await response.json() };
}

async function member(sub: string) {
  const signIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: sub, email: 'listed@example.in', name: 'Initial Name' });
  const cookie = signIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const onboard = await call('/onboarding', 'POST', cookie, { displayName: 'Initial Name', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 });
  expect(onboard.response.status).toBe(200);
  return cookie;
}

describe('profile and privacy notice API', () => {
  beforeAll(async () => {
    vi.stubEnv('API_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('WEB_ORIGIN', origin);
    vi.stubEnv('DATABASE_URL', databaseUrl.toString());
    vi.stubEnv('OWNER_CONTACT_EMAIL', 'owner@example.in');
    vi.stubEnv('SESSION_SECRET', 'integration-test-secret-with-enough-entropy');
    vi.stubEnv('PRELAUNCH_ALLOWED_EMAILS', 'listed@example.in');
    vi.stubEnv('LAUNCH_OPEN', 'false');
    vi.stubEnv('TEST_AUTH_ENABLED', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
    });
    app = await start();
    db = app.get(PrismaService);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    vi.restoreAllMocks();
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    await db.consent.deleteMany({ where: { privacyNoticeVersion: { version: { gt: 1 } } } });
    await db.privacyNoticeVersion.deleteMany({ where: { version: { gt: 1 } } });
  });

  test('done-when-3: own profile edits validate and preserve private Google identity', async () => {
    const notice = await call('/privacy-notice');
    expect(notice.response.status).toBe(401);
    const cookie = await member('profile-owner');
    const currentNotice = await call('/privacy-notice', 'GET', cookie);
    expect(currentNotice.payload.data).toMatchObject({ version: 1, text: expect.stringContaining('owner@example.in') });
    expect(currentNotice.payload.data.text).toContain('3 days for point-in-time restore and 7 days for daily backups');
    expect(currentNotice.payload.data.text).toContain('stored in Singapore');
    expect(currentNotice.payload.data.text).not.toContain('{{OWNER_CONTACT_EMAIL}}');
    expect((await db.privacyNoticeVersion.findUniqueOrThrow({ where: { version: 1 } })).text).toBe(currentNotice.payload.data.text);
    const another = await member('profile-other');
    const original = (await call('/members/me', 'GET', cookie)).payload.data;
    expect(original).toMatchObject({ googleEmail: 'listed@example.in', googleAccountId: 'profile-owner' });
    for (const body of [{ displayName: ' ' }, { displayName: 'x'.repeat(51) }, { displayName: null }, { whatsappNumber: '12' }, { whatsappNumber: null }]) {
      const invalid = await call('/members/me', 'PATCH', cookie, body);
      expect(invalid.response.status).toBe(400);
      expect(invalid.payload.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ field: Object.keys(body)[0] })]));
      expect((await call('/members/me', 'GET', cookie)).payload.data).toEqual(original);
    }
    const changed = await call('/members/me', 'PATCH', cookie, { displayName: '  New Name  ', whatsappNumber: '+447911123456' });
    expect(changed.response.status).toBe(200);
    expect(changed.payload.data).toMatchObject({ displayName: 'New Name', whatsappE164: '+447911123456', googleAccountId: 'profile-owner' });
    expect((await call('/members/me', 'GET', another)).payload.data.googleAccountId).toBe('profile-other');
    expect((await call('/members/me', 'GET', another)).payload.data.googleEmail).toBe('listed@example.in');
  });

  test('done-when-3: a material notice requires explicit acceptance before member access', async () => {
    const cookie = await member('notice-owner');
    await db.privacyNoticeVersion.create({ data: { version: 2, text: 'Material change notice', isMaterialChange: true, publishedAtUtc: new Date() } });
    const blocked = await call('/members/me', 'GET', cookie);
    expect(blocked.response.status).toBe(403);
    expect(blocked.payload.error.code).toBe('PRIVACY_NOTICE_REQUIRED');
    expect(blocked.payload.error.message).toBe('Accept the current privacy notice to continue.');
    expect((await call('/privacy-notice', 'GET', cookie)).payload.data).toMatchObject({ version: 2, text: 'Material change notice' });
    for (const body of [{ version: 1, isConsentGiven: true }, { version: 2, isConsentGiven: false }]) {
      expect((await call('/privacy-notice/accept', 'POST', cookie, body)).response.status).toBe(400);
    }
    const accepted = await call('/privacy-notice/accept', 'POST', cookie, { version: 2, isConsentGiven: true });
    expect(accepted.response.status).toBe(200);
    expect(accepted.payload.data).toMatchObject({ version: 2, acceptedAtUtc: expect.any(String) });
    expect((await call('/members/me', 'GET', cookie)).response.status).toBe(200);
    expect(await db.consent.count({ where: { member: { googleAccountId: 'notice-owner' } } })).toBe(2);
    await db.privacyNoticeVersion.create({ data: { version: 3, text: 'Wording only change', isMaterialChange: false, publishedAtUtc: new Date() } });
    expect((await call('/members/me', 'GET', cookie)).response.status).toBe(200);
  });
});
