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
const schemaName = `cwf_manage_${randomUUID().replace(/-/g, '')}`;
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
  const response = await fetch(`${apiUrl}/api/v1${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
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
  return { id, code: (invite.payload.data.url as string).split('/').at(-1)! };
}

async function join(code: string, cookie: string) {
  expect((await call(`/circle-invites/${code}/join`, 'POST', cookie)).response.status).toBe(200);
}

async function raceOnCircleLock(circleId: string, competitors: Array<{ name: string; path: string; method: string; cookie: string; body?: unknown }>) {
  const lockDb = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
  const running = await Promise.all(competitors.map(async (competitor) => {
    const namedUrl = new URL(databaseUrl);
    namedUrl.searchParams.set('application_name', competitor.name);
    const database = new PrismaService({ datasources: { db: { url: namedUrl.toString() } } });
    const application = await start(database);
    return { ...competitor, application, database, apiUrl: `http://127.0.0.1:${(application.getHttpServer().address() as AddressInfo).port}` };
  }));
  let release!: () => void;
  let ready!: (pid: number) => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const locked = new Promise<number>((resolve) => { ready = resolve; });
  const blocker = lockDb.$transaction(async (tx) => {
    const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    await tx.$queryRaw`SELECT "id" FROM "Circle" WHERE "id" = ${circleId}::uuid FOR UPDATE`;
    ready(pid);
    await released;
  }, { timeout: 30_000 });
  const requests: Array<ReturnType<typeof call>> = [];
  try {
    try {
      const blockerPid = await locked;
      for (const competitor of running) {
        requests.push(call(competitor.path, competitor.method, competitor.cookie, competitor.body, competitor.apiUrl));
        await vi.waitFor(async () => {
          const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
            SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
            WHERE application_name = ${competitor.name} AND wait_event_type = 'Lock'`;
          expect(waiting.some(({ pid, blockers }) => pid !== blockerPid && blockers.length > 0)).toBe(true);
        }, { timeout: 10_000 });
      }
    } finally {
      release();
      try { await blocker; } finally { await lockDb.$disconnect(); }
    }
    return await Promise.all(requests);
  } finally {
    await Promise.allSettled(requests);
    await Promise.allSettled(running.map(async ({ application, database }) => { await application.close(); await database.$disconnect(); }));
  }
}

describe('circle management API', () => {
  beforeAll(async () => {
    for (const [name, value] of Object.entries({ API_ORIGIN: 'http://localhost:3000', WEB_ORIGIN: origin, DATABASE_URL: databaseUrl.toString(), OWNER_CONTACT_EMAIL: 'owner@example.in', SESSION_SECRET: 'integration-test-secret-with-enough-entropy', PRELAUNCH_ALLOWED_EMAILS: 'listed@example.in', LAUNCH_OPEN: 'false', TEST_AUTH_ENABLED: 'true', TRUST_PROXY: '1', NODE_ENV: 'test' })) vi.stubEnv(name, value);
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString() } });
    app = await start();
    db = app.get(PrismaService);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 180_000);

  afterAll(async () => {
    if (app) await app.close();
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    vi.unstubAllEnvs();
  }, 180_000);

  test('done-when-4 and 6: rename validates input before permission and handover transfers every admin power', async () => {
    const admin = await member('manage-admin');
    const next = await member('manage-next');
    const outsider = await member('manage-outsider');
    const target = await circle(admin.cookie, 'Before');
    await join(target.code, next.cookie);
    const path = `/circles/${target.id}`;
    for (const name of ['', ' ', 'x'.repeat(41)]) {
      const invalid = await call(path, 'PATCH', admin.cookie, { name });
      expect(invalid.response.status).toBe(400);
      expect(invalid.payload.error.details.fieldErrors).toContainEqual({ field: 'name', reason: 'Use 1 to 40 characters.' });
    }
    for (const body of [{}, { name: 4 }, { name: null }]) {
      const invalid = await call(path, 'PATCH', outsider.cookie, body);
      const sameForMember = await call(path, 'PATCH', next.cookie, body);
      expect(invalid.response.status).toBe(400);
      expect(invalid.payload.error.code).toBe('VALIDATION_ERROR');
      expect(invalid.payload.error.details).toEqual(sameForMember.payload.error.details);
      expect(JSON.stringify(invalid.payload)).not.toContain('Before');
    }
    expect((await call(path, 'PATCH', outsider.cookie)).payload.error.code).toBe('VALIDATION_ERROR');
    for (const [action, method, body] of [[path, 'PATCH', { name: 'No' }], [`${path}/handover`, 'POST', { memberId: next.id }], [path, 'DELETE']] as const) {
      expect((await call(action, method, outsider.cookie, body)).response.status).toBe(404);
      expect((await call(action, method, next.cookie, body)).response.status).toBe(403);
    }
    for (const [action, method, body] of [['/circles/bad-id', 'PATCH', { name: 'No' }], ['/circles/bad-id/handover', 'POST', { memberId: next.id }], ['/circles/bad-id', 'DELETE'], [`${path}/handover`, 'POST', { memberId: 'bad-id' }]] as const) {
      expect((await call(action, method, outsider.cookie, body)).payload.error.code).toBe('VALIDATION_ERROR');
    }
    const renamed = await call(path, 'PATCH', admin.cookie, { name: '  After  ' });
    expect(renamed.payload.data.name).toBe('After');
    expect((await call(path, 'GET', next.cookie)).payload.data.name).toBe('After');
    expect((await call('/circles', 'GET', next.cookie)).payload.data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: target.id, name: 'After' })]));
    for (const memberId of [admin.id, outsider.id]) {
      const denied = await call(`${path}/handover`, 'POST', admin.cookie, { memberId });
      expect(denied.response.status).toBe(memberId === admin.id ? 403 : 404);
      expect(denied.payload.error.message).toBe(memberId === admin.id ? 'Choose another member to become admin.' : 'Choose a current member of this circle.');
    }
    expect((await call(`${path}/handover`, 'POST', admin.cookie, { memberId: next.id })).response.status).toBe(200);
    const formerAdminActions: Array<[string, string, unknown?]> = [
      [path, 'PATCH', { name: 'No' }], [`${path}/handover`, 'POST', { memberId: admin.id }], [path, 'DELETE'],
      [`${path}/invite`, 'GET'], [`${path}/invite/reset`, 'POST'], [`${path}/invite/record`, 'POST', { action: 'copy' }],
      [`${path}/members/${next.id}/remove`, 'POST'], [`${path}/removals/clear`, 'POST'],
    ];
    for (const [action, method, body] of formerAdminActions) {
      expect((await call(action, method, admin.cookie, body)).response.status).toBe(403);
    }
    expect((await call(`${path}/invite`, 'GET', next.cookie)).response.status).toBe(200);
    expect((await call(path, 'PATCH', next.cookie, { name: 'New admin' })).response.status).toBe(200);
    expect((await call(`${path}/removals/clear`, 'POST', next.cookie)).response.status).toBe(200);
    expect((await call(`${path}/invite/reset`, 'POST', next.cookie)).response.status).toBe(200);
    expect((await call(`${path}/members/${admin.id}/remove`, 'POST', next.cookie)).response.status).toBe(200);
    expect((await call(path, 'DELETE', next.cookie)).response.status).toBe(200);
  }, 60_000);

  test('done-when-5 and 6: deletion keeps usage history but ends every membership and name visibility', async () => {
    const admin = await member('delete-admin');
    const memberOne = await member('delete-member');
    const removed = await member('delete-removed');
    const outsider = await member('delete-outsider');
    const target = await circle(admin.cookie, 'Last name');
    await join(target.code, memberOne.cookie);
    await join(target.code, removed.cookie);
    expect((await call(`/circles/${target.id}/members/${removed.id}/remove`, 'POST', admin.cookie)).response.status).toBe(200);
    expect(await db.circleRemovalBlock.count({ where: { circleId: target.id } })).toBe(1);
    const kept = await circle(admin.cookie, 'Still shared');
    await join(kept.code, memberOne.cookie);
    const usage = await db.usageEvent.create({ data: { type: 'invite', memberId: admin.id, circles: { create: { circleId: target.id } } } });
    const before = await db.circle.findUniqueOrThrow({ where: { id: target.id } });
    expect((await call(`/circles/${target.id}`, 'DELETE', memberOne.cookie)).response.status).toBe(403);
    expect((await call(`/circles/${target.id}`, 'DELETE', outsider.cookie)).response.status).toBe(404);
    expect((await call(`/circles/${target.id}`, 'DELETE', admin.cookie)).response.status).toBe(200);
    const after = await db.circle.findUniqueOrThrow({ where: { id: target.id } });
    expect(after).toMatchObject({ name: 'Last name', createdAtUtc: before.createdAtUtc, isOwnerCreated: before.isOwnerCreated, inviteCode: null, adminMemberId: null });
    expect(after.deletedAtUtc).not.toBeNull();
    expect(await db.usageEvent.findUnique({ where: { id: usage.id } })).not.toBeNull();
    expect(await db.usageEventCircle.findFirst({ where: { circleId: target.id, usageEventId: usage.id } })).not.toBeNull();
    expect(await db.circleMembership.count({ where: { circleId: target.id } })).toBe(0);
    expect(await db.circleRemovalBlock.count({ where: { circleId: target.id } })).toBe(0);
    for (const cookie of [admin.cookie, memberOne.cookie, outsider.cookie]) {
      expect((await call(`/circle-invites/${target.code}`, 'GET', cookie)).payload.error.message).toBe('This invite link is no longer valid. Ask the person who shared it for a new one.');
      expect((await call(`/circles/${target.id}`, 'GET', cookie)).response.status).toBe(404);
    }
    for (const cookie of [admin.cookie, memberOne.cookie]) {
      expect((await call('/circles', 'GET', cookie)).payload.data.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: target.id })]));
      const visible = await call(`/circles/${kept.id}`, 'GET', cookie);
      expect(JSON.stringify(visible.payload)).toContain('delete-admin');
      expect(JSON.stringify(visible.payload)).toContain('delete-member');
    }
    const alone = await circle(admin.cookie, 'No other shared circle');
    const separateMember = await member('delete-separate');
    await join(alone.code, separateMember.cookie);
    expect((await call(`/circles/${alone.id}`, 'DELETE', admin.cookie)).response.status).toBe(200);
    for (const cookie of [admin.cookie, separateMember.cookie]) {
      expect(JSON.stringify((await call(`/circles/${alone.id}`, 'GET', cookie)).payload)).not.toContain(cookie === admin.cookie ? 'delete-separate' : 'delete-admin');
      expect(JSON.stringify((await call('/circles', 'GET', cookie)).payload)).not.toContain('No other shared circle');
    }
  }, 60_000);

  test('done-when-4 and 5: handover and deletion serialize against leaving', async () => {
    const admin = await member('race-manage-admin');
    const successor = await member('race-manage-successor');
    const renameTarget = await circle(admin.cookie, 'Race rename');
    await join(renameTarget.code, successor.cookie);
    const [firstHandover, oldAdminRename] = await raceOnCircleLock(renameTarget.id, [
      { name: `${schemaName}_racehandover`, path: `/circles/${renameTarget.id}/handover`, method: 'POST', cookie: admin.cookie, body: { memberId: successor.id } },
      { name: `${schemaName}_racerename`, path: `/circles/${renameTarget.id}`, method: 'PATCH', cookie: admin.cookie, body: { name: 'Not allowed' } },
    ]);
    expect(firstHandover.response.status).toBe(200);
    expect(oldAdminRename.response.status).toBe(403);
    expect((await db.circle.findUniqueOrThrow({ where: { id: renameTarget.id } })).name).toBe('Race rename');
    expect((await call(`/circles/${renameTarget.id}`, 'PATCH', successor.cookie, { name: 'Allowed' })).response.status).toBe(200);
    const target = await circle(admin.cookie, 'Race handover');
    await join(target.code, successor.cookie);
    const [handover, leaving] = await raceOnCircleLock(target.id, [
      { name: `${schemaName}_handover`, path: `/circles/${target.id}/handover`, method: 'POST', cookie: admin.cookie, body: { memberId: successor.id } },
      { name: `${schemaName}_leave`, path: `/circles/${target.id}/leave`, method: 'POST', cookie: successor.cookie },
    ]);
    expect(handover.response.status).toBe(200);
    expect(leaving.response.status).toBe(200);
    expect((await db.circle.findUniqueOrThrow({ where: { id: target.id } })).adminMemberId).toBe(admin.id);
    const [deleting, adminLeaving] = await raceOnCircleLock(target.id, [
      { name: `${schemaName}_delete`, path: `/circles/${target.id}`, method: 'DELETE', cookie: admin.cookie },
      { name: `${schemaName}_adminleave`, path: `/circles/${target.id}/leave`, method: 'POST', cookie: admin.cookie },
    ]);
    expect(deleting.response.status).toBe(200);
    expect(adminLeaving.response.status).toBe(404);
    const saved = await db.circle.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.deletedAtUtc).not.toBeNull();
    expect(saved.adminMemberId).toBeNull();
    expect(await db.circleMembership.count({ where: { circleId: target.id } })).toBe(0);
  }, 120_000);
});
