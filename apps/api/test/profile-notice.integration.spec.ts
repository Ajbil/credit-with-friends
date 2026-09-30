import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';

const origin = 'http://localhost:4173';
const expectedVersionOneText = readFileSync(fileURLToPath(new URL('../prisma/privacy-notice-v1.expected.txt', import.meta.url)), 'utf8');
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_profile_test_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
let app: Awaited<ReturnType<typeof start>>;
let db: PrismaService;
let url: string;
let publishedVersionOneText: string;

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
  test('done-when-3: an existing consent survives the contact address migration', async () => {
    const prismaDirectory = fileURLToPath(new URL('../prisma/', import.meta.url));
    const temporaryDirectory = mkdtempSync(join(prismaDirectory, '.consent-upgrade-'));
    const upgradeSchema = `cwf_consent_upgrade_${randomUUID().replace(/-/g, '')}`;
    const upgradeUrl = new URL(baseDatabaseUrl);
    upgradeUrl.searchParams.set('schema', upgradeSchema);
    const migrationDirectory = join(temporaryDirectory, 'migrations');
    const migrate = () => execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy', '--schema', join(temporaryDirectory, 'schema.prisma')], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: upgradeUrl.toString() },
    });
    const previousMigrations = ['20260927000000_initial', '20260930000000_accounts', '20260930110000_privacy_notice_v1'];
    const oldDb = new PrismaClient({ datasources: { db: { url: upgradeUrl.toString() } } });
    try {
      mkdirSync(migrationDirectory);
      copyFileSync(join(prismaDirectory, 'schema.prisma'), join(temporaryDirectory, 'schema.prisma'));
      copyFileSync(join(prismaDirectory, 'migrations', 'migration_lock.toml'), join(migrationDirectory, 'migration_lock.toml'));
      for (const name of previousMigrations) cpSync(join(prismaDirectory, 'migrations', name), join(migrationDirectory, name), { recursive: true });
      migrate();
      const member = await oldDb.member.create({ data: { googleAccountId: 'old-consent', googleEmail: 'old@example.in', displayName: 'Old Member', whatsappE164: '+919876543210', isAdultConfirmed: true } });
      const notice = await oldDb.privacyNoticeVersion.findUniqueOrThrow({ where: { version: 1 } });
      await oldDb.$executeRaw`INSERT INTO "Consent" ("memberId", "privacyNoticeVersionId", "updatedAtUtc") VALUES (${member.id}::uuid, ${notice.id}::uuid, CURRENT_TIMESTAMP)`;
      cpSync(join(prismaDirectory, 'migrations', '20260930120000_consent_contact_email'), join(migrationDirectory, '20260930120000_consent_contact_email'), { recursive: true });
      migrate();
      const consent = await oldDb.consent.findFirstOrThrow({ where: { memberId: member.id } });
      expect(consent.contactEmail).toBe('unknown@example.invalid');
      expect(consent.privacyNoticeVersionId).toBe(notice.id);
    } finally {
      await oldDb.$disconnect();
      const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
      await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
      await admin.$disconnect();
      if (realpathSync(temporaryDirectory).startsWith(realpathSync(prismaDirectory) + sep)) rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 30_000);

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
    const beforeBoot = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
    publishedVersionOneText = (await beforeBoot.privacyNoticeVersion.findUniqueOrThrow({ where: { version: 1 }, select: { text: true } })).text;
    expect(publishedVersionOneText).toBe(expectedVersionOneText);
    await beforeBoot.$disconnect();
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
    expect(currentNotice.payload.data).toEqual({ version: 1, text: expectedVersionOneText.replaceAll('{{OWNER_CONTACT_EMAIL}}', 'owner@example.in') });
    expect(currentNotice.payload.data.text).toContain('3 days for point-in-time restore and 7 days for daily backups');
    expect(currentNotice.payload.data.text).toContain('stored in Singapore');
    expect(currentNotice.payload.data.text).not.toContain('{{OWNER_CONTACT_EMAIL}}');
    // The published template is immutable; the configured address appears only in the served text.
    expect((await db.privacyNoticeVersion.findUniqueOrThrow({ where: { version: 1 } })).text).toBe(publishedVersionOneText);
    expect(publishedVersionOneText).toContain('{{OWNER_CONTACT_EMAIL}}');
    const another = await member('profile-other');
    const original = (await call('/members/me', 'GET', cookie)).payload.data;
    expect(original).toMatchObject({ googleEmail: 'listed@example.in', googleAccountId: 'profile-owner' });
    for (const { body, reason } of [
      { body: { displayName: ' ' }, reason: 'Use 1 to 50 characters.' },
      { body: { displayName: 'x'.repeat(51) }, reason: 'Use 1 to 50 characters.' },
      { body: { displayName: null }, reason: 'Use 1 to 50 characters.' },
      { body: { whatsappNumber: '12' }, reason: 'Enter a valid phone number with a country code.' },
      { body: { whatsappNumber: null }, reason: 'Enter a valid phone number with a country code.' },
    ]) {
      const invalid = await call('/members/me', 'PATCH', cookie, body);
      expect(invalid.response.status).toBe(400);
      expect(invalid.payload.error.details.fieldErrors).toEqual(expect.arrayContaining([{ field: Object.keys(body)[0], reason }]));
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
    const versionOneConsent = await db.consent.findFirstOrThrow({ where: { member: { googleAccountId: 'notice-owner' }, privacyNoticeVersion: { version: 1 } }, include: { privacyNoticeVersion: true } });
    expect(versionOneConsent.privacyNoticeVersion.text).toBe(publishedVersionOneText);
    expect(versionOneConsent.contactEmail).toBe('owner@example.in');
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
    expect((await db.consent.findFirstOrThrow({ where: { member: { googleAccountId: 'notice-owner' }, privacyNoticeVersion: { version: 2 } } })).contactEmail).toBe('owner@example.in');
    const retainedConsent = await db.consent.findUniqueOrThrow({ where: { id: versionOneConsent.id }, include: { privacyNoticeVersion: true } });
    expect(retainedConsent).toEqual(versionOneConsent);
    expect(retainedConsent.privacyNoticeVersion.text).toBe(publishedVersionOneText);
    await db.privacyNoticeVersion.create({ data: { version: 3, text: 'Wording only change', isMaterialChange: false, publishedAtUtc: new Date() } });
    expect((await call('/members/me', 'GET', cookie)).response.status).toBe(200);
  });

  test('done-when-3: changing the contact address preserves earlier consent and notice text', async () => {
    const cookie = await member('contact-change-owner');
    const original = await db.consent.findFirstOrThrow({ where: { member: { googleAccountId: 'contact-change-owner' }, privacyNoticeVersion: { version: 1 } } });
    expect(original.contactEmail).toBe('owner@example.in');
    const config = app.get(ConfigService<ApiConfig, true>);
    config.set('ownerContactEmail', 'updated@example.in');
    try {
      const served = await call('/privacy-notice', 'GET', cookie);
      expect(served.payload.data.text).toBe(expectedVersionOneText.replaceAll('{{OWNER_CONTACT_EMAIL}}', 'updated@example.in'));
      expect(await db.consent.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
      expect((await db.privacyNoticeVersion.findUniqueOrThrow({ where: { version: 1 } })).text).toBe(expectedVersionOneText);
      await db.privacyNoticeVersion.create({ data: { version: 2, text: 'New purpose. Contact {{OWNER_CONTACT_EMAIL}}.', isMaterialChange: true, publishedAtUtc: new Date() } });
      expect((await call('/privacy-notice', 'GET', cookie)).payload.data.text).toBe('New purpose. Contact updated@example.in.');
      expect((await call('/privacy-notice/accept', 'POST', cookie, { version: 2, isConsentGiven: true })).response.status).toBe(200);
      expect((await db.consent.findFirstOrThrow({ where: { member: { googleAccountId: 'contact-change-owner' }, privacyNoticeVersion: { version: 2 } } })).contactEmail).toBe('updated@example.in');
      expect(await db.consent.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
    } finally {
      config.set('ownerContactEmail', 'owner@example.in');
    }
  });
});
