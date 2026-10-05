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
const schemaName = `cwf_circle_view_${randomUUID().replace(/-/g, '')}`;
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

async function member(name: string) {
  const signedIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: name, email: 'listed@example.in', name });
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect((await call('/onboarding', 'POST', cookie, { displayName: name, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
  const profile = await call('/members/me', 'GET', cookie);
  return { cookie, id: profile.payload.data.id };
}

describe('circle view API', () => {
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

  test('done-when-4: only circle members receive the name and member display names without phone numbers', async () => {
    const admin = await member('Circle admin');
    const joined = await member('Circle member');
    const outsider = await member('Outsider');
    const created = await call('/circles', 'POST', admin.cookie, { name: 'College batch' });
    expect(created.response.status).toBe(201);
    const circleId = created.payload.data.id;

    // The join route belongs to T1D; establish its resulting membership until that route exists.
    await db.circleMembership.create({ data: { circleId, memberId: joined.id } });

    for (const cookie of [admin.cookie, joined.cookie]) {
      const viewed = await call(`/circles/${circleId}`, 'GET', cookie);
      expect(viewed.response.status).toBe(200);
      expect(viewed.payload).toEqual({ success: true, data: { id: circleId, name: 'College batch', members: [
        { id: admin.id, displayName: 'Circle admin', isAdmin: true },
        { id: joined.id, displayName: 'Circle member', isAdmin: false },
      ] }, error: null });
      expect(JSON.stringify(viewed.payload)).not.toContain('9876543210');
      expect(JSON.stringify(viewed.payload)).not.toContain('whatsapp');
    }

    for (const [path, cookie] of [[`/circles/${circleId}`, outsider.cookie], [`/circles/${randomUUID()}`, admin.cookie]]) {
      const denied = await call(path, 'GET', cookie);
      expect(denied.response.status).toBe(404);
      expect(denied.payload).toEqual(expect.objectContaining({ success: false, data: null, error: expect.objectContaining({ code: 'NOT_FOUND' }) }));
      expect(JSON.stringify(denied.payload)).not.toContain('Circle member');
      expect(JSON.stringify(denied.payload)).not.toContain('College batch');
    }
  });
});
