import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_circles_test_${randomUUID().replace(/-/g, '')}`;
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

async function member(googleAccountId: string) {
  const signedIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId, email: 'listed@example.in', name: googleAccountId });
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect((await call('/onboarding', 'POST', cookie, { displayName: googleAccountId, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
  return cookie;
}

describe('circles create API', () => {
  beforeAll(async () => {
    for (const [name, value] of Object.entries({ API_ORIGIN: 'http://localhost:3000', WEB_ORIGIN: origin, DATABASE_URL: databaseUrl.toString(), OWNER_CONTACT_EMAIL: 'owner@example.in', SESSION_SECRET: 'integration-test-secret-with-enough-entropy', PRELAUNCH_ALLOWED_EMAILS: 'listed@example.in', LAUNCH_OPEN: 'false', TEST_AUTH_ENABLED: 'true', NODE_ENV: 'test', OWNER_GOOGLE_ACCOUNT_ID: 'circle-owner' })) vi.stubEnv(name, value);
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString() } });
    app = await start();
    db = app.get(PrismaService);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    vi.unstubAllEnvs();
  }, 60_000);

  test('done-when-1: a completed member creates a named circle as sole admin within the 20-circle limit', async () => {
    const pending = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: 'pending-creator', email: 'listed@example.in', name: 'Pending' });
    const pendingCookie = pending.response.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect((await call('/circles', 'POST', pendingCookie, { name: 'Nope' })).response.status).toBe(403);

    const cookie = await member('circle-owner');
    for (const name of ['', ' ', 'x'.repeat(41)]) {
      const invalid = await call('/circles', 'POST', cookie, { name });
      expect(invalid.response.status).toBe(400);
      expect(invalid.payload.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'name' })]));
    }
    const first = await call('/circles', 'POST', cookie, { name: '  College batch  ' });
    expect(first.response.status).toBe(201);
    expect(first.payload.data).toMatchObject({ name: 'College batch' });
    expect(first.payload.data).not.toHaveProperty('inviteCode');
    const circle = await db.circle.findUniqueOrThrow({ where: { id: first.payload.data.id }, include: { memberships: true } });
    expect(circle).toMatchObject({ name: 'College batch', isOwnerCreated: true, adminMemberId: circle.memberships[0].memberId });
    expect(circle.memberships).toHaveLength(1);
    expect(await db.usageEvent.count()).toBe(0);

    const simultaneous = await Promise.all(Array.from({ length: 22 }, (_, index) => call('/circles', 'POST', cookie, { name: `Circle ${index}` })));
    expect(simultaneous.filter(({ response }) => response.status === 201)).toHaveLength(19);
    expect(simultaneous.filter(({ response }) => response.status === 400)).toHaveLength(3);
    expect(simultaneous.find(({ response }) => response.status === 400)?.payload.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'name', reason: expect.stringContaining('20') })]));
    expect(await db.circleMembership.count({ where: { memberId: circle.adminMemberId! } })).toBe(20);

    const other = await member('another-creator');
    const createdByOther = await call('/circles', 'POST', other, { name: 'Family' });
    expect(createdByOther.response.status).toBe(201);
    expect((await db.circle.findUniqueOrThrow({ where: { id: createdByOther.payload.data.id } })).isOwnerCreated).toBe(false);
    app.get(ConfigService<ApiConfig, true>).set('ownerGoogleAccountId', '');
    const noOwner = await member('no-owner-configured');
    const createdWithoutOwner = await call('/circles', 'POST', noOwner, { name: 'Neighbours' });
    expect(createdWithoutOwner.response.status).toBe(201);
    expect((await db.circle.findUniqueOrThrow({ where: { id: createdWithoutOwner.payload.data.id } })).isOwnerCreated).toBe(false);
    expect((await db.circle.findUniqueOrThrow({ where: { id: circle.id } })).isOwnerCreated).toBe(true);
  });

  test('done-when-2 foundation: creation gives each circle one unguessable active invite code', async () => {
    const cookie = await member('code-creator');
    const first = await call('/circles', 'POST', cookie, { name: 'Office' });
    const second = await call('/circles', 'POST', cookie, { name: 'Family' });
    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(201);
    const codes = (await db.circle.findMany({ where: { id: { in: [first.payload.data.id, second.payload.data.id] } }, select: { inviteCode: true } })).map(({ inviteCode }) => inviteCode);
    expect(codes).toHaveLength(2);
    expect(codes[0]).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(codes[1]).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(codes[0]).not.toBe(codes[1]);
  });
});
