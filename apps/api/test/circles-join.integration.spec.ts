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
const schemaName = `cwf_join_test_${randomUUID().replace(/-/g, '')}`;
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

async function call(path: string, method = 'GET', cookie = '', body?: unknown, clientIp?: string) {
  const headers: Record<string, string> = { cookie };
  if (clientIp) headers['x-forwarded-for'] = clientIp;
  if (method !== 'GET') Object.assign(headers, { origin, 'x-requested-with': 'cwf', 'content-type': 'application/json' });
  const response = await fetch(`${url}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, payload: await response.json() };
}

async function signIn(id: string, onboard = true, clientIp?: string) {
  const signedIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: id, email: 'listed@example.in', name: id, returnPath: '/circles/join/example' }, clientIp);
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (!onboard) return { cookie, id: '' };
  expect((await call('/onboarding', 'POST', cookie, { displayName: id, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, clientIp)).response.status).toBe(200);
  const profile = await call('/members/me', 'GET', cookie, undefined, clientIp);
  return { cookie, id: profile.payload.data.id as string };
}

async function create(adminCookie: string, name: string) {
  const created = await call('/circles', 'POST', adminCookie, { name });
  expect(created.response.status).toBe(201);
  const circleId = created.payload.data.id as string;
  const invite = await call(`/circles/${circleId}/invite`, 'GET', adminCookie);
  return { circleId, code: (invite.payload.data.url as string).split('/').at(-1)! };
}

describe('open and join a circle invite', () => {
  beforeAll(async () => {
    for (const [name, value] of Object.entries({ API_ORIGIN: 'http://localhost:3000', WEB_ORIGIN: origin, DATABASE_URL: databaseUrl.toString(), OWNER_CONTACT_EMAIL: 'owner@example.in', SESSION_SECRET: 'integration-test-secret-with-enough-entropy', PRELAUNCH_ALLOWED_EMAILS: 'listed@example.in', LAUNCH_OPEN: 'false', TEST_AUTH_ENABLED: 'true', TRUST_PROXY: '1', NODE_ENV: 'test' })) vi.stubEnv(name, value);
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

  test('done-when-2: a joined non-admin cannot retrieve or reset the invite', async () => {
    const admin = await signIn('join-admin');
    const other = await signIn('join-other');
    const { circleId, code } = await create(admin.cookie, 'College batch');
    const joined = await call(`/circle-invites/${code}/join`, 'POST', other.cookie);
    expect(joined.response.status, JSON.stringify(joined.payload)).toBe(200);
    for (const [method, suffix] of [['GET', ''], ['POST', '/reset'], ['POST', '/record']] as const) {
      const denied = await call(`/circles/${circleId}/invite${suffix}`, method, other.cookie, method === 'POST' ? { action: 'copy' } : undefined);
      expect(denied.response.status).toBe(403);
      expect(JSON.stringify(denied.payload)).not.toContain(code);
    }
  });

  test('done-when-3: preview validates the link first, then sign-in, membership and join limits', async () => {
    const admin = await signIn('preview-admin');
    const newcomer = await signIn('preview-newcomer');
    const pending = await signIn('preview-pending', false);
    const { circleId, code } = await create(admin.cookie, 'Family');
    const path = `/circle-invites/${code}`;
    for (const deadCode of ['bad!', 'A'.repeat(22)]) {
      const dead = await call(`/circle-invites/${deadCode}`, 'GET', admin.cookie);
      expect(dead.response.status).toBe(404);
      expect(dead.payload.error.message).toBe('This invite link is no longer valid. Ask the person who shared it for a new one.');
      expect(JSON.stringify(dead.payload)).not.toContain('Family');
    }
    expect((await call(path)).response.status).toBe(401);
    expect((await call(path, 'GET', pending.cookie)).response.status).toBe(401);
    expect((await call(`${path}/join`, 'POST', pending.cookie)).response.status).toBe(403);
    const preview = await call(path, 'GET', newcomer.cookie);
    expect(preview.response.status).toBe(200);
    expect(preview.payload.data).toEqual({ status: 'preview', name: 'Family', memberCount: 1 });
    expect(await db.circleMembership.count({ where: { circleId } })).toBe(1);
    const joined = await call(`${path}/join`, 'POST', newcomer.cookie);
    expect(joined.response.status).toBe(200);
    expect(joined.payload.data).toEqual({ circleId });
    expect((await call(path, 'GET', newcomer.cookie)).payload.data).toEqual({ status: 'already_member', circleId });
    expect((await call(`${path}/join`, 'POST', newcomer.cookie)).response.status).toBe(200);
    expect(await db.circleMembership.count({ where: { circleId } })).toBe(2);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { type: 'join', memberId: newcomer.id, circles: { some: { circleId } } } })).toBe(1));

    const reset = await call(`/circles/${circleId}/invite/reset`, 'POST', admin.cookie);
    const newCode = (reset.payload.data.url as string).split('/').at(-1)!;
    for (const cookie of ['', admin.cookie, newcomer.cookie]) {
      const old = await call(path, 'GET', cookie);
      expect(old.response.status).toBe(404);
      expect(old.payload.error.message).toBe('This invite link is no longer valid. Ask the person who shared it for a new one.');
      expect(JSON.stringify(old.payload)).not.toContain('Family');
    }
    expect((await call(`/circle-invites/${newCode}`, 'GET', admin.cookie)).payload.data).toEqual({ status: 'already_member', circleId });
    expect((await call(`/circle-invites/${newCode}`, 'GET', pending.cookie)).response.status).toBe(401);
    const afterReset = await call(`/circle-invites/${newCode}/join`, 'POST', pending.cookie);
    expect(afterReset.response.status).toBe(403);
    expect((await call('/sign-ins', 'GET', pending.cookie)).payload.data.returnPath).toBe('/circles/join/example');
    expect((await call('/onboarding', 'POST', pending.cookie, { displayName: 'preview-pending', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
    const active = await call(`/circle-invites/${newCode}`, 'GET', pending.cookie);
    expect(active.payload.data).toEqual({ status: 'preview', name: 'Family', memberCount: 2 });
    expect((await call(`/circle-invites/${newCode}/join`, 'POST', pending.cookie)).response.status).toBe(200);
    expect((await call(`/circle-invites/${code}/join`, 'POST', pending.cookie)).response.status).toBe(404);
  });

  test('done-when-3: simultaneous joins stop at 20 circles per member', async () => {
    const member = await signIn('limit-member');
    const admins = await Promise.all([signIn('limit-admin-a'), signIn('limit-admin-b')]);
    const owned = await Promise.all(Array.from({ length: 19 }, (_, index) => call('/circles', 'POST', member.cookie, { name: `Owned ${index}` })));
    expect(owned.every(({ response }) => response.status === 201)).toBe(true);
    const targets = await Promise.all(admins.map(({ cookie }, index) => create(cookie, `Target ${index}`)));
    const joins = await Promise.all(targets.map(({ code }) => call(`/circle-invites/${code}/join`, 'POST', member.cookie)));
    expect(joins.map(({ response }) => response.status).sort()).toEqual([200, 409]);
    expect(joins.find(({ response }) => response.status === 409)?.payload.error.message).toContain('20 circles');
    expect(await db.circleMembership.count({ where: { memberId: member.id } })).toBe(20);
  });

  test('done-when-3: a failed join event never undoes membership', async () => {
    const admin = await signIn('event-admin');
    const member = await signIn('event-member');
    const { circleId, code } = await create(admin.cookie, 'Event circle');
    const warning = vi.spyOn(PinoLogger.prototype, 'warn');
    await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" ADD CONSTRAINT "test_join_usage_failure" CHECK ("type" <> \'join\') NOT VALID');
    try {
      const joined = await call(`/circle-invites/${code}/join`, 'POST', member.cookie);
      expect(joined.response.status).toBe(200);
      expect((await call(`/circles/${circleId}`, 'GET', member.cookie)).response.status).toBe(200);
      await vi.waitFor(() => expect(warning).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ eventName: 'CircleJoinedEvent', outcome: 'failed' }) }), 'Usage event recording failed'));
      expect(await db.usageEvent.count({ where: { type: 'join', memberId: member.id, circles: { some: { circleId } } } })).toBe(0);
    } finally {
      warning.mockRestore();
      await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" DROP CONSTRAINT "test_join_usage_failure"');
    }
  });

  test('done-when-3: simultaneous joins stop at 100 members', async () => {
    const admin = await signIn('full-admin');
    const { circleId, code } = await create(admin.cookie, 'Full circle');
    for (let start = 0; start < 98; start += 10) {
      const members = await Promise.all(Array.from({ length: Math.min(10, 98 - start) }, (_, offset) => {
        const index = start + offset;
        return signIn(`full-member-${index}`, true, `10.20.0.${index + 1}`);
      }));
      const joined = await Promise.all(members.map(({ cookie }, offset) => call(`/circle-invites/${code}/join`, 'POST', cookie, undefined, `10.20.0.${start + offset + 1}`)));
      expect(joined.every(({ response }) => response.status === 200)).toBe(true);
    }
    const candidates = await Promise.all([signIn('full-extra-a', true, '10.21.0.1'), signIn('full-extra-b', true, '10.21.0.2')]);
    const refused = await Promise.all(candidates.map(({ cookie }, index) => call(`/circle-invites/${code}/join`, 'POST', cookie, undefined, `10.21.0.${index + 1}`)));
    expect(refused.map(({ response }) => response.status).sort()).toEqual([200, 409]);
    expect(refused.find(({ response }) => response.status === 409)?.payload.error.message).toContain('full');
    expect(await db.circleMembership.count({ where: { circleId } })).toBe(100);
  }, 120_000);
});
