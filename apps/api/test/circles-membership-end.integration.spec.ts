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
import { CirclesCoreService } from '../src/modules/circles/core/circles-core.service';

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_membership_end_${randomUUID().replace(/-/g, '')}`;
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
  return { cookie, id: (await call('/members/me', 'GET', cookie)).payload.data.id as string };
}

describe('circle membership ending', () => {
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

  test('done-when-2: ending membership passes admin to the earliest join with an ID tie-break and deletes the empty circle without losing usage', async () => {
    const admin = await member('end-admin');
    const first = await member('end-first');
    const second = await member('end-second');
    const created = await call('/circles', 'POST', admin.cookie, { name: 'End circle' });
    expect(created.response.status).toBe(201);
    const circleId = created.payload.data.id as string;
    const invite = await call(`/circles/${circleId}/invite`, 'GET', admin.cookie);
    const code = (invite.payload.data.url as string).split('/').at(-1)!;
    for (const person of [first, second]) expect((await call(`/circle-invites/${code}/join`, 'POST', person.cookie)).response.status).toBe(200);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { type: 'join', circles: { some: { circleId } } } })).toBe(2));

    const memberships = await db.circleMembership.findMany({ where: { circleId, memberId: { in: [first.id, second.id] } }, orderBy: { id: 'asc' } });
    await db.circleMembership.updateMany({ where: { id: { in: memberships.map(({ id }) => id) } }, data: { joinedAtUtc: new Date('2026-01-01T00:00:00Z') } });
    const service = app.get(CirclesCoreService);
    await service.endMembership(circleId, admin.id);
    const successorId = memberships[0].memberId;
    expect((await db.circle.findUniqueOrThrow({ where: { id: circleId } })).adminMemberId).toBe(successorId);
    expect((await call(`/circles/${circleId}/invite`, 'GET', memberships[0].memberId === first.id ? first.cookie : second.cookie)).response.status).toBe(200);
    expect((await call(`/circles/${circleId}/invite`, 'GET', admin.cookie)).response.status).toBe(403);

    await service.endMembership(circleId, memberships[1].memberId);
    expect((await db.circle.findUniqueOrThrow({ where: { id: circleId } })).adminMemberId).toBe(successorId);
    await service.endMembership(circleId, successorId);
    expect(await db.circle.findUniqueOrThrow({ where: { id: circleId } })).toMatchObject({ deletedAtUtc: expect.any(Date), inviteCode: null, adminMemberId: null });
    expect(await db.circleMembership.count({ where: { circleId } })).toBe(0);
    const dead = await call(`/circle-invites/${code}`, 'GET', admin.cookie);
    expect(dead.response.status).toBe(404);
    expect(dead.payload.error.code).toBe('INVITE_LINK_INVALID');
    expect(await db.usageEvent.count({ where: { type: 'join', circles: { some: { circleId } } } })).toBe(2);
  });

  test('done-when-2: admin succession prefers the earliest join time before membership ID', async () => {
    const admin = await member('earliest-admin');
    const first = await member('earliest-first');
    const second = await member('earliest-second');
    const created = await call('/circles', 'POST', admin.cookie, { name: 'Earliest circle' });
    const circleId = created.payload.data.id as string;
    const code = ((await call(`/circles/${circleId}/invite`, 'GET', admin.cookie)).payload.data.url as string).split('/').at(-1)!;
    for (const person of [first, second]) expect((await call(`/circle-invites/${code}/join`, 'POST', person.cookie)).response.status).toBe(200);
    const rows = await db.circleMembership.findMany({ where: { circleId, memberId: { in: [first.id, second.id] } }, orderBy: { id: 'asc' } });
    await db.circleMembership.update({ where: { id: rows[0].id }, data: { joinedAtUtc: new Date('2026-01-02T00:00:00Z') } });
    await db.circleMembership.update({ where: { id: rows[1].id }, data: { joinedAtUtc: new Date('2026-01-01T00:00:00Z') } });
    await app.get(CirclesCoreService).endMembership(circleId, admin.id);
    expect((await db.circle.findUniqueOrThrow({ where: { id: circleId } })).adminMemberId).toBe(rows[1].memberId);
  });

  test('done-when-2: an old admin cannot reset an invite after a handover commits while reset waits on the circle lock', async () => {
    const admin = await member('lock-admin');
    const next = await member('lock-next');
    const created = await call('/circles', 'POST', admin.cookie, { name: 'Lock circle' });
    const circleId = created.payload.data.id as string;
    const path = `/circles/${circleId}/invite`;
    const code = ((await call(path, 'GET', admin.cookie)).payload.data.url as string).split('/').at(-1)!;
    expect((await call(`/circle-invites/${code}/join`, 'POST', next.cookie)).response.status).toBe(200);
    const lockDb = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
    let release!: () => void;
    let ready!: (pid: number) => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<number>((resolve) => { ready = resolve; });
    const blocker = lockDb.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT "id" FROM "Circle" WHERE "id" = ${circleId}::uuid FOR UPDATE`;
      ready(pid);
      await released;
      await tx.circle.update({ where: { id: circleId }, data: { adminMemberId: next.id } });
    }, { timeout: 20_000 });
    let request: ReturnType<typeof call> | undefined;
    try {
      const blockerPid = await locked;
      request = call(`${path}/reset`, 'POST', admin.cookie);
      await vi.waitFor(async () => {
        const [{ waiting }] = await db.$queryRaw<Array<{ waiting: number }>>`SELECT COUNT(*)::int AS waiting FROM pg_stat_activity WHERE ${blockerPid} = ANY(pg_blocking_pids(pid)) AND wait_event_type = 'Lock'`;
        expect(waiting).toBeGreaterThan(0);
      }, { timeout: 10_000 });
    } finally {
      release();
      try { await blocker; } finally { await lockDb.$disconnect(); }
    }
    const denied = await request!;
    expect(denied.response.status).toBe(403);
    expect((await db.circle.findUniqueOrThrow({ where: { id: circleId } })).inviteCode).toBe(code);
    expect((await call(`${path}/reset`, 'POST', next.cookie)).response.status).toBe(200);
  }, 30_000);
});
