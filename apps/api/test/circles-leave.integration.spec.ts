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
const schemaName = `cwf_circle_leave_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
let app: Awaited<ReturnType<typeof start>>;
let db: PrismaService;
let url: string;

async function start(database?: PrismaService) {
  const [{ AppModule }, { configureApi }] = await Promise.all([import('../src/app.module'), import('../src/common/api/api.config')]);
  const builder = Test.createTestingModule({ imports: [AppModule] });
  if (database) builder.overrideProvider(PrismaService).useValue(database);
  const module = await builder.compile();
  const application = module.createNestApplication();
  configureApi(application, application.get(ConfigService<ApiConfig, true>));
  await application.listen(0, '127.0.0.1');
  return application;
}

async function call(path: string, method = 'GET', cookie = '', body?: unknown, apiUrl = url) {
  const headers: Record<string, string> = { cookie };
  if (method !== 'GET') Object.assign(headers, { origin, 'x-requested-with': 'cwf', 'content-type': 'application/json' });
  const response = await fetch(`${apiUrl}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, payload: await response.json() };
}

async function member(name: string) {
  const signedIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: name, email: 'listed@example.in', name });
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect((await call('/onboarding', 'POST', cookie, { displayName: name, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
  return { cookie, id: (await call('/members/me', 'GET', cookie)).payload.data.id as string };
}

async function circle(cookie: string, name: string) {
  const created = await call('/circles', 'POST', cookie, { name });
  expect(created.response.status).toBe(201);
  const id = created.payload.data.id as string;
  const invite = await call(`/circles/${id}/invite`, 'GET', cookie);
  expect(invite.response.status).toBe(200);
  return { id, code: (invite.payload.data.url as string).split('/').at(-1)! };
}

async function join(code: string, cookie: string) {
  const result = await call(`/circle-invites/${code}/join`, 'POST', cookie);
  expect(result.response.status).toBe(200);
}

describe('circle leave API', () => {
  beforeAll(async () => {
    for (const [name, value] of Object.entries({ API_ORIGIN: 'http://localhost:3000', WEB_ORIGIN: origin, DATABASE_URL: databaseUrl.toString(), OWNER_CONTACT_EMAIL: 'owner@example.in', SESSION_SECRET: 'integration-test-secret-with-enough-entropy', PRELAUNCH_ALLOWED_EMAILS: 'listed@example.in', LAUNCH_OPEN: 'false', TEST_AUTH_ENABLED: 'true', NODE_ENV: 'test' })) vi.stubEnv(name, value);
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString() } });
    const leaveDatabaseUrl = new URL(databaseUrl);
    leaveDatabaseUrl.searchParams.set('application_name', `${schemaName}_leave`);
    app = await start(new PrismaService({ datasources: { db: { url: leaveDatabaseUrl.toString() } } }));
    db = app.get(PrismaService);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
      await db.$disconnect();
    }
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    vi.unstubAllEnvs();
  }, 60_000);

  test('done-when-1: a member leaves, loses the circle, and rejoins through the same link; invalid and unauthorized leaves are refused', async () => {
    const owner = await member('leave-owner');
    const departing = await member('leave-departing');
    const outsider = await member('leave-outsider');
    const target = await circle(owner.cookie, 'Leave and return');
    await join(target.code, departing.cookie);

    const left = await call(`/circles/${target.id}/leave`, 'POST', departing.cookie);
    expect(left.response.status).toBe(200);
    expect(left.payload).toEqual({ success: true, data: null, error: null });
    expect((await call('/circles', 'GET', departing.cookie)).payload.data.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: target.id })]));
    const view = await call(`/circles/${target.id}`, 'GET', departing.cookie);
    expect(view.response.status).toBe(404);
    const again = await call(`/circles/${target.id}/leave`, 'POST', departing.cookie);
    const nonMember = await call(`/circles/${target.id}/leave`, 'POST', outsider.cookie);
    expect([again.response.status, nonMember.response.status]).toEqual([404, 404]);
    expect([again.payload.error.code, nonMember.payload.error.code]).toEqual([view.payload.error.code, view.payload.error.code]);
    const malformed = await call('/circles/not-a-uuid/leave', 'POST', departing.cookie);
    expect(malformed.response.status).toBe(400);
    expect(malformed.payload.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'circleId', reason: 'invalid_value' }] } });

    const preview = await call(`/circle-invites/${target.code}`, 'GET', departing.cookie);
    expect(preview.payload.data).toMatchObject({ status: 'preview', name: 'Leave and return' });
    await join(target.code, departing.cookie);
    expect((await call(`/circles/${target.id}`, 'GET', departing.cookie)).response.status).toBe(200);
  });

  test('done-when-2: the admin may leave and the last member leaving invalidates the link without losing usage', async () => {
    const owner = await member('last-owner');
    const successor = await member('last-successor');
    const target = await circle(owner.cookie, 'Succession by leaving');
    await join(target.code, successor.cookie);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { type: 'join', circles: { some: { circleId: target.id } } } })).toBe(1));

    expect((await call(`/circles/${target.id}/leave`, 'POST', owner.cookie)).response.status).toBe(200);
    const viewed = await call(`/circles/${target.id}`, 'GET', successor.cookie);
    expect(viewed.payload.data.members).toEqual([{ id: successor.id, displayName: 'last-successor', isAdmin: true }]);
    expect((await call(`/circles/${target.id}/invite`, 'GET', successor.cookie)).response.status).toBe(200);
    expect((await call(`/circles/${target.id}/leave`, 'POST', successor.cookie)).response.status).toBe(200);
    expect(await db.circle.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ deletedAtUtc: expect.any(Date), inviteCode: null, adminMemberId: null });
    expect(await db.circleMembership.count({ where: { circleId: target.id } })).toBe(0);
    const dead = await call(`/circle-invites/${target.code}`, 'GET', owner.cookie);
    expect(dead.response.status).toBe(404);
    expect(dead.payload.error.code).toBe('INVITE_LINK_INVALID');
    expect(await db.usageEvent.count({ where: { type: 'join', circles: { some: { circleId: target.id } } } })).toBe(1);
  });

  test('done-when-6: leaving hides names in both directions unless another circle is shared', async () => {
    const owner = await member('names-owner');
    const departing = await member('names-departing');
    const only = await circle(owner.cookie, 'Only shared circle');
    const also = await circle(owner.cookie, 'Still shared circle');
    await join(only.code, departing.cookie);
    await join(also.code, departing.cookie);

    expect((await call(`/circles/${only.id}/leave`, 'POST', departing.cookie)).response.status).toBe(200);
    const denied = await call(`/circles/${only.id}`, 'GET', departing.cookie);
    expect(denied.response.status).toBe(404);
    expect(JSON.stringify(denied.payload)).not.toContain('names-owner');
    const onlyOwner = await call(`/circles/${only.id}`, 'GET', owner.cookie);
    expect(onlyOwner.payload.data.members.map(({ displayName }: { displayName: string }) => displayName)).toEqual(['names-owner']);
    for (const cookie of [owner.cookie, departing.cookie]) {
      const shared = await call(`/circles/${also.id}`, 'GET', cookie);
      expect(shared.payload.data.members.map(({ displayName }: { displayName: string }) => displayName)).toEqual(['names-owner', 'names-departing']);
    }
    expect((await call(`/circles/${also.id}/leave`, 'POST', departing.cookie)).response.status).toBe(200);
    const noCircle = await call(`/circles/${also.id}`, 'GET', departing.cookie);
    expect(JSON.stringify(noCircle.payload)).not.toContain('names-owner');
    const ownerView = await call(`/circles/${also.id}`, 'GET', owner.cookie);
    expect(JSON.stringify(ownerView.payload)).not.toContain('names-departing');
  });

  test('done-when-2: an admin leave waiting on a join keeps one current admin', async () => {
    const owner = await member('race-leave-owner');
    const joining = await member('race-leave-joining');
    const target = await circle(owner.cookie, 'Leave join race');
    const lockDb = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
    const joinDatabaseUrl = new URL(databaseUrl);
    joinDatabaseUrl.searchParams.set('application_name', `${schemaName}_join`);
    const joinDb = new PrismaService({ datasources: { db: { url: joinDatabaseUrl.toString() } } });
    const joinApp = await start(joinDb);
    const joinUrl = `http://127.0.0.1:${(joinApp.getHttpServer().address() as AddressInfo).port}`;
    let release!: () => void;
    let ready!: (pid: number) => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<number>((resolve) => { ready = resolve; });
    const blocker = lockDb.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT "id" FROM "Circle" WHERE "id" = ${target.id}::uuid FOR UPDATE`;
      ready(pid);
      await released;
    }, { timeout: 20_000 });
    let leaveRequest: ReturnType<typeof call> | undefined;
    let joinRequest: ReturnType<typeof call> | undefined;
    try {
      try {
        const blockerPid = await locked;
        leaveRequest = call(`/circles/${target.id}/leave`, 'POST', owner.cookie);
        joinRequest = call(`/circle-invites/${target.code}/join`, 'POST', joining.cookie, undefined, joinUrl);
        await vi.waitFor(async () => {
          const waiting = await db.$queryRaw<Array<{ pid: number; application_name: string; blockers: number[] }>>`
            SELECT pid, application_name, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
            WHERE application_name IN (${`${schemaName}_leave`}, ${`${schemaName}_join`}) AND wait_event_type = 'Lock'`;
          expect(waiting.map(({ application_name }) => application_name)).toEqual(expect.arrayContaining([`${schemaName}_leave`, `${schemaName}_join`]));
          expect(new Set(waiting.map(({ pid }) => pid)).size).toBe(2);
          const leaveWait = waiting.find(({ application_name }) => application_name === `${schemaName}_leave`)!;
          const joinWait = waiting.find(({ application_name }) => application_name === `${schemaName}_join`)!;
          expect([blockerPid, joinWait.pid].some((pid) => leaveWait.blockers.includes(pid))).toBe(true);
          expect([blockerPid, leaveWait.pid].some((pid) => joinWait.blockers.includes(pid))).toBe(true);
          expect(waiting.some(({ blockers }) => blockers.includes(blockerPid))).toBe(true);
        }, { timeout: 10_000 });
      } finally {
        release();
        try { await blocker; } finally { await lockDb.$disconnect(); }
      }
      const [left, joined] = await Promise.all([leaveRequest!, joinRequest!]);
      expect(left.response.status).toBe(200);
      expect([200, 404]).toContain(joined.response.status);
      const current = await db.circle.findUniqueOrThrow({ where: { id: target.id }, include: { memberships: true } });
      if (current.memberships.length) {
        expect(current.memberships).toHaveLength(1);
        expect(current.adminMemberId).toBe(current.memberships[0].memberId);
        expect(current.deletedAtUtc).toBeNull();
      } else {
        expect(current.adminMemberId).toBeNull();
        expect(current.deletedAtUtc).not.toBeNull();
      }
    } finally {
      await Promise.allSettled([leaveRequest, joinRequest].filter((request): request is ReturnType<typeof call> => request !== undefined));
      await joinApp.close();
      await joinDb.$disconnect();
    }
  }, 30_000);
});
