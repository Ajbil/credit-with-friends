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
const schemaName = `cwf_circles_list_test_${randomUUID().replace(/-/g, '')}`;
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

describe('circles list API', () => {
  beforeAll(async () => {
    for (const [name, value] of Object.entries({ API_ORIGIN: 'http://localhost:3000', WEB_ORIGIN: origin, DATABASE_URL: databaseUrl.toString(), OWNER_CONTACT_EMAIL: 'owner@example.in', SESSION_SECRET: 'integration-test-secret-with-enough-entropy', PRELAUNCH_ALLOWED_EMAILS: 'listed@example.in', LAUNCH_OPEN: 'false', TEST_AUTH_ENABLED: 'true', NODE_ENV: 'test' })) vi.stubEnv(name, value);
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

  test('done-when-1: a member sees only their circles with name, member count and admin status', async () => {
    const alice = await member('list-alice');
    const bob = await member('list-bob');
    const empty = await call('/circles', 'GET', alice);
    expect(empty.response.status).toBe(200);
    expect(empty.payload.data).toEqual({ items: [], pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } });

    const first = await call('/circles', 'POST', alice, { name: 'College' });
    const second = await call('/circles', 'POST', alice, { name: 'Family' });
    const third = await call('/circles', 'POST', alice, { name: 'Office' });
    const privateCircle = await call('/circles', 'POST', bob, { name: 'Bob only' });
    expect([first.response.status, second.response.status, third.response.status, privateCircle.response.status]).toEqual([201, 201, 201, 201]);

    // Joining belongs to T2. Place Bob in two existing circles and give the newest two
    // circles the same timestamp to exercise the list contract through HTTP.
    const bobProfile = await call('/members/me', 'GET', bob);
    await db.circleMembership.createMany({ data: [first, second].map(({ payload }) => ({ circleId: payload.data.id, memberId: bobProfile.payload.data.id })) });
    await db.circle.updateMany({ where: { id: { in: [first.payload.data.id, second.payload.data.id] } }, data: { createdAtUtc: new Date('2030-01-01T00:00:00.000Z') } });
    await db.circle.updateMany({ where: { id: { in: [third.payload.data.id, privateCircle.payload.data.id] } }, data: { createdAtUtc: new Date('2020-01-01T00:00:00.000Z') } });
    const newestIds = [first.payload.data.id, second.payload.data.id].sort().reverse();

    const listed = await call('/circles', 'GET', alice);
    expect(listed.response.status).toBe(200);
    expect(listed.payload.data.pagination).toEqual({ page: 1, limit: 20, totalItems: 3, totalPages: 1 });
    expect(listed.payload.data.items.map(({ id }: { id: string }) => id)).toEqual([...newestIds, third.payload.data.id]);
    expect(listed.payload.data.items).toEqual(expect.arrayContaining([
      { id: first.payload.data.id, name: 'College', memberCount: 2, isAdmin: true },
      { id: second.payload.data.id, name: 'Family', memberCount: 2, isAdmin: true },
      { id: third.payload.data.id, name: 'Office', memberCount: 1, isAdmin: true },
    ]));
    expect(JSON.stringify(listed.payload)).not.toContain('Bob only');
    expect(JSON.stringify(listed.payload)).not.toContain('inviteCode');

    for (const [pageNumber, circleId] of [...newestIds, third.payload.data.id].entries()) {
      const page = await call(`/circles?page=${pageNumber + 1}&limit=1`, 'GET', alice);
      expect(page.response.status).toBe(200);
      expect(page.payload.data.items.map(({ id }: { id: string }) => id)).toEqual([circleId]);
      expect(page.payload.data.pagination).toEqual({ page: pageNumber + 1, limit: 1, totalItems: 3, totalPages: 3 });
    }
    const bobList = await call('/circles', 'GET', bob);
    expect(bobList.payload.data.items).toEqual([
      { id: newestIds[0], name: newestIds[0] === first.payload.data.id ? 'College' : 'Family', memberCount: 2, isAdmin: false },
      { id: newestIds[1], name: newestIds[1] === first.payload.data.id ? 'College' : 'Family', memberCount: 2, isAdmin: false },
      { id: privateCircle.payload.data.id, name: 'Bob only', memberCount: 1, isAdmin: true },
    ]);

    expect((await call('/circles')).response.status).toBe(401);
    const pending = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: 'list-pending', email: 'listed@example.in', name: 'Pending' });
    const pendingCookie = pending.response.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect((await call('/circles', 'GET', pendingCookie)).response.status).toBe(403);
    for (const query of ['?page=0', '?page=abc', '?page=2147483649&limit=1', '?limit=0', '?limit=101', '?unexpected=1']) {
      const invalid = await call(`/circles${query}`, 'GET', alice);
      expect(invalid.response.status).toBe(400);
      expect(invalid.payload.error.details.fieldErrors).toHaveLength(1);
    }
  });
});
