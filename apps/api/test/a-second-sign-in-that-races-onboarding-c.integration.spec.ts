import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';

const origin = 'http://localhost:5173';
const person = { googleAccountId: `racing-sign-in-${randomUUID()}`, email: 'listed@example.in', name: 'Racing Member' };
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_racing_sign_in_${randomUUID().replace(/-/g, '')}`;
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

describe('a second sign-in racing onboarding', () => {
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
  });

  afterAll(async () => {
    if (app) await app.close();
    vi.restoreAllMocks();
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    vi.unstubAllEnvs();
  });

  test('a sign-in that finds the member created during its pending write returns a member session and leaves no pending sign-in', async () => {
    const first = await call('/test-auth/sign-in', 'POST', '', person);
    expect(first.payload.data.status).toBe('pending');
    const firstCookie = first.response.headers.get('set-cookie')?.split(';')[0] ?? '';
    const originalUpsert = db.pendingSignIn.upsert.bind(db.pendingSignIn);
    const upsert = vi.spyOn(db.pendingSignIn, 'upsert').mockImplementation(async (args) => {
      const onboarded = await call('/onboarding', 'POST', firstCookie, {
        displayName: 'Racing Member', whatsappNumber: '9876543210', isAdultConfirmed: true,
        isConsentGiven: true, privacyNoticeVersion: 1,
      });
      expect(onboarded.response.status).toBe(200);
      return originalUpsert(args);
    });
    try {
      const second = await call('/test-auth/sign-in', 'POST', '', person);
      expect(second.response.status).toBe(201);
      expect(second.payload.data.status).toBe('member');
      const secondCookie = second.response.headers.get('set-cookie')?.split(';')[0] ?? '';
      const firstMember = await call('/members/me', 'GET', firstCookie);
      const secondMember = await call('/members/me', 'GET', secondCookie);
      expect(secondMember.response.status).toBe(200);
      expect(secondMember.payload.data.id).toBe(firstMember.payload.data.id);
      expect(await db.pendingSignIn.count({ where: { googleAccountId: person.googleAccountId } })).toBe(0);
      expect(await db.session.count({ where: { pendingSignInId: { not: null } } })).toBe(0);
    } finally {
      upsert.mockRestore();
    }
  });
});
