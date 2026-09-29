import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/common/database/prisma.service';
import type { ApiConfig } from '../src/common/config/config.module';
import { PendingCleanupService } from '../src/modules/accounts/pending-cleanup.service';

const origin = 'http://localhost:5173';
const identity = { googleAccountId: 'account-test-one', email: 'listed@example.in', name: 'Listed Person' };
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_accounts_test_${randomUUID().replace(/-/g, '')}`;
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
  const response = await fetch(`${url}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  return { response, payload: await response.json() };
}

async function signIn(person = identity) {
  const { response, payload } = await call('/test-auth/sign-in', 'POST', '', person);
  return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

describe('sign-in and onboarding API', () => {
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
    await db.privacyNoticeVersion.create({ data: { version: 1, text: 'Test notice', isMaterialChange: true, publishedAtUtc: new Date() } });
  });

  afterAll(async () => {
    if (app) await app.close();
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    vi.unstubAllEnvs();
  });

  test('done-when-1: onboarding creates one member and pending sign-ins cannot use member data', async () => {
    const { cookie } = await signIn();
    expect((await call('/members/me', 'GET', cookie)).response.status).toBe(403);
    const valid = { displayName: '  Listed Person  ', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 };
    for (const [field, change] of [
      ['displayName', { displayName: ' ' }],
      ['displayName', { displayName: 'x'.repeat(51) }],
      ['whatsappNumber', { whatsappNumber: '12' }],
      ['isAdultConfirmed', { isAdultConfirmed: false }],
      ['isConsentGiven', { isConsentGiven: false }],
      ['privacyNoticeVersion', { privacyNoticeVersion: 99 }],
    ] as const) {
      const invalid = await call('/onboarding', 'POST', cookie, { ...valid, ...change });
      expect(invalid.response.status).toBe(400);
      expect(invalid.payload.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    }
    expect(await db.member.count({ where: { googleAccountId: identity.googleAccountId } })).toBe(0);

    const submit = () => call('/onboarding', 'POST', cookie, valid);
    const results = await Promise.all([submit(), submit()]);
    expect(results.map(({ response }) => response.status).sort()).toEqual([200, 200]);
    expect(await db.member.count({ where: { googleAccountId: identity.googleAccountId } })).toBe(1);
    const consents = await db.consent.findMany({ where: { member: { googleAccountId: identity.googleAccountId } }, include: { privacyNoticeVersion: true } });
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({ acceptedAtUtc: expect.any(Date), privacyNoticeVersion: { version: 1, text: 'Test notice' } });
    const profile = await call('/members/me', 'GET', cookie);
    expect(profile.payload.data).toMatchObject({ displayName: 'Listed Person', whatsappE164: '+919876543210' });
    const changedEmail = await signIn({ ...identity, email: 'changed@example.in' });
    expect(changedEmail.payload.data.status).toBe('member');
    expect((await call('/members/me', 'GET', changedEmail.cookie)).payload.data.id).toBe(profile.payload.data.id);
    expect((await call('/members/me', 'GET', changedEmail.cookie)).payload.data.googleEmail).toBe('changed@example.in');

    const second = await signIn({ googleAccountId: 'account-test-two', email: identity.email, name: 'Second Person', returnPath: '/circles/join/example' });
    expect((await call('/sign-ins', 'GET', second.cookie)).payload.data.returnPath).toBe('/circles/join/example');
    const nonIndian = await call('/onboarding', 'POST', second.cookie, { displayName: 'A', whatsappNumber: '+447911123456', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 });
    expect(nonIndian.response.status).toBe(200);
    expect(nonIndian.payload.data.whatsappE164).toBe('+447911123456');
  });

  test('done-when-2: prelaunch denial stores nothing; cancel and inactivity erase pending sign-ins', async () => {
    const rejected = await signIn({ googleAccountId: 'not-listed', email: 'stranger@example.in', name: 'Stranger' });
    expect(rejected.response.status).toBe(403);
    expect(rejected.payload.error.message).toBe('Not open yet');
    expect(await db.pendingSignIn.count({ where: { googleAccountId: 'not-listed' } })).toBe(0);
    expect(await db.member.count({ where: { googleAccountId: 'not-listed' } })).toBe(0);

    const person = { googleAccountId: 'pending-cancel', email: identity.email, name: 'Pending' };
    const pending = await signIn(person);
    expect(pending.payload.data.status).toBe('pending');
    expect((await call('/sign-ins/cancel', 'POST', pending.cookie)).response.status).toBe(200);
    expect(await db.pendingSignIn.count({ where: { googleAccountId: person.googleAccountId } })).toBe(0);
    expect((await call('/onboarding', 'POST', pending.cookie, {})).response.status).toBe(401);

    const stale = await signIn({ ...person, googleAccountId: 'pending-stale' });
    await db.pendingSignIn.update({ where: { googleAccountId: 'pending-stale' }, data: { lastActivityAtUtc: new Date(Date.now() - 31 * 86_400_000) } });
    await app.get(PendingCleanupService).run();
    expect(await db.pendingSignIn.count({ where: { googleAccountId: 'pending-stale' } })).toBe(0);
    expect((await call('/sign-ins', 'GET', stale.cookie)).response.status).toBe(401);

  });

  test('sessions expire independently and a later sign-in keeps member data', async () => {
    const person = { googleAccountId: 'account-test-sessions', email: identity.email, name: 'Device Person' };
    const pending = await signIn(person);
    expect((await call('/onboarding', 'POST', pending.cookie, { displayName: 'Device Person', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
    const deviceOne = await signIn(person);
    const deviceTwo = await signIn(person);
    expect((await call('/sessions/sign-out', 'POST', deviceOne.cookie)).response.status).toBe(201);
    expect((await call('/members/me', 'GET', deviceOne.cookie)).response.status).toBe(401);
    expect((await call('/members/me', 'GET', deviceTwo.cookie)).response.status).toBe(200);
    const tokenHash = createHash('sha256').update(deviceTwo.cookie.split('=')[1]).digest('hex');
    await db.session.update({ where: { tokenHash }, data: { expiresAtUtc: new Date(Date.now() - 1) } });
    expect((await call('/members/me', 'GET', deviceTwo.cookie)).response.status).toBe(401);
    const restored = await signIn(person);
    expect((await call('/members/me', 'GET', restored.cookie)).payload.data.displayName).toBe('Device Person');
  });
});
