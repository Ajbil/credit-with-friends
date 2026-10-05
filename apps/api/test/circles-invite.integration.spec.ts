import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_invite_test_${randomUUID().replace(/-/g, '')}`;
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

async function call(path: string, method = 'GET', cookie = '', body?: unknown, signal?: AbortSignal) {
  const headers: Record<string, string> = { cookie };
  if (method !== 'GET') Object.assign(headers, { origin, 'x-requested-with': 'cwf', 'content-type': 'application/json' });
  const response = await fetch(`${url}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  return { response, payload: await response.json() };
}

async function member(id: string) {
  const signedIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: id, email: 'listed@example.in', name: id });
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect((await call('/onboarding', 'POST', cookie, { displayName: id, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
  const profile = await call('/members/me', 'GET', cookie);
  return { cookie, id: profile.payload.data.id as string };
}

describe('circle invite API', () => {
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

  test('done-when-2: only the admin retrieves, records sharing, and resets an active invite', async () => {
    const admin = await member('invite-admin');
    const outsider = await member('invite-outsider');
    const created = await call('/circles', 'POST', admin.cookie, { name: 'College batch' });
    expect(created.response.status).toBe(201);
    const path = `/circles/${created.payload.data.id}/invite`;
    for (const [method, suffix, body] of [['GET', '', undefined], ['POST', '/reset', undefined], ['POST', '/record', { action: 'copy' }]] as const) {
      expect((await call(`${path}${suffix}`, method, outsider.cookie, body)).response.status).toBe(403);
    }
    const first = await call(path, 'GET', admin.cookie);
    expect(first.response.status).toBe(200);
    expect(first.payload.data.url).toMatch(/^http:\/\/localhost:5173\/circles\/join\/[A-Za-z0-9_-]{22}$/);
    const initialCode = first.payload.data.url.split('/').at(-1);
    for (const action of ['copy', 'whatsapp']) {
      const recorded = await call(`${path}/record`, 'POST', admin.cookie, { action });
      expect(recorded.response.status).toBe(200);
      expect(recorded.payload.data.recorded).toBe(true);
      if (action === 'whatsapp') {
        const sharedText = new URL(recorded.payload.data.whatsappUrl).searchParams.get('text');
        expect(sharedText).toContain('College batch');
        expect(sharedText).toContain(first.payload.data.url);
      }
    }
    await vi.waitFor(async () => {
      expect(await db.usageEvent.count({ where: { type: 'invite', memberId: admin.id, circles: { some: { circleId: created.payload.data.id } } } })).toBe(2);
    }, { timeout: 5_000 });
    expect((await call(`${path}/record`, 'POST', admin.cookie, { action: 'invalid' })).response.status).toBe(400);
    const reset = await call(`${path}/reset`, 'POST', admin.cookie);
    expect(reset.response.status).toBe(200);
    expect(reset.payload.data.url).not.toBe(first.payload.data.url);
    expect((await db.circle.findUniqueOrThrow({ where: { id: created.payload.data.id } })).inviteCode).not.toBe(initialCode);
    expect(await db.circle.findUnique({ where: { inviteCode: initialCode } })).toBeNull();
    expect((await db.circle.findUnique({ where: { inviteCode: reset.payload.data.url.split('/').at(-1) } }))?.id).toBe(created.payload.data.id);
    expect(await db.circleMembership.count({ where: { circleId: created.payload.data.id } })).toBe(1);
    expect(await db.usageEvent.count({ where: { type: 'invite' } })).toBe(2);

    const lockDb = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
    let lockReady!: () => void;
    let releaseLock!: () => void;
    const ready = new Promise<void>((resolve) => { lockReady = resolve; });
    const held = new Promise<void>((resolve) => { releaseLock = resolve; });
    const lockTransaction = lockDb.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('LOCK TABLE "UsageEvent" IN ACCESS EXCLUSIVE MODE');
      lockReady();
      await held;
    }, { timeout: 15_000 });
    try {
      await Promise.race([ready, lockTransaction]);
      for (const action of ['whatsapp', 'copy']) {
        const shared = await call(`${path}/record`, 'POST', admin.cookie, { action }, AbortSignal.timeout(3_000));
        expect(shared.response.status).toBe(200);
        if (action === 'whatsapp') expect(shared.payload.data.whatsappUrl).toContain('wa.me');
      }
    } finally {
      releaseLock();
      try { await lockTransaction; } finally { await lockDb.$disconnect(); }
    }
    await vi.waitFor(async () => {
      expect(await db.usageEvent.count({ where: { type: 'invite', memberId: admin.id, circles: { some: { circleId: created.payload.data.id } } } })).toBe(4);
    }, { timeout: 5_000 });

    const warning = vi.spyOn(PinoLogger.prototype, 'warn');
    await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" ADD CONSTRAINT "test_usage_failure" CHECK ("type" <> \'invite\') NOT VALID');
    try {
      const failedRecord = await call(`${path}/record`, 'POST', admin.cookie, { action: 'copy' });
      expect(failedRecord.response.status).toBe(200);
      // The old response reported the completed write. It now reports acceptance because recording finishes after the response.
      expect(failedRecord.payload.data.recorded).toBe(true);
      await vi.waitFor(() => {
        expect(warning).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ eventName: 'CircleInviteEvent', outcome: 'failed' }) }), 'Usage event recording failed');
      }, { timeout: 5_000 });
      expect(await db.usageEvent.count({ where: { type: 'invite' } })).toBe(4);
    } finally {
      warning.mockRestore();
      await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" DROP CONSTRAINT "test_usage_failure"');
    }
  });
});
