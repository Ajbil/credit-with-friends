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
const schemaName = `cwf_removals_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
let app: Awaited<ReturnType<typeof start>>;
let db: PrismaService;
let url: string;
let nextClientIp = 1;

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

async function call(path: string, method = 'GET', cookie = '', apiUrl = url) {
  const headers: Record<string, string> = { cookie };
  if (method !== 'GET') Object.assign(headers, { origin, 'x-requested-with': 'cwf', 'content-type': 'application/json' });
  const response = await fetch(`${apiUrl}/api/v1${path}`, { method, headers });
  return { response, payload: await response.json() };
}

async function post(path: string, cookie: string, body: unknown, clientIp?: string) {
  const response = await fetch(`${url}/api/v1${path}`, { method: 'POST', headers: { cookie, origin, 'x-requested-with': 'cwf', 'content-type': 'application/json', ...(clientIp ? { 'x-forwarded-for': clientIp } : {}) }, body: JSON.stringify(body) });
  return { response, payload: await response.json() };
}

async function member(name: string) {
  const clientIp = `10.80.0.${nextClientIp++}`;
  const signedIn = await post('/test-auth/sign-in', '', { googleAccountId: name, email: 'listed@example.in', name }, clientIp);
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect((await post('/onboarding', cookie, { displayName: name, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }, clientIp)).response.status).toBe(200);
  return { cookie, id: (await call('/members/me', 'GET', cookie)).payload.data.id as string };
}

async function circle(cookie: string, name: string) {
  const created = await post('/circles', cookie, { name });
  expect(created.response.status).toBe(201);
  const id = created.payload.data.id as string;
  const invite = await call(`/circles/${id}/invite`, 'GET', cookie);
  return { id, code: (invite.payload.data.url as string).split('/').at(-1)! };
}

async function join(code: string, cookie: string) {
  expect((await call(`/circle-invites/${code}/join`, 'POST', cookie)).response.status).toBe(200);
}

async function raceOnCircleLock(circleId: string, competitors: Array<{ name: string; path: string; cookie: string }>) {
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
        requests.push(call(competitor.path, 'POST', competitor.cookie, competitor.apiUrl));
        await vi.waitFor(async () => {
          const waiting = await db.$queryRaw<Array<{ application_name: string; pid: number; blockers: number[] }>>`
            SELECT application_name, pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
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

describe('circle removals API', () => {
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

  test('done-when-3: removal blocks preview and Join through current and reset links until cleared', async () => {
    const admin = await member('remove-admin');
    const removed = await member('remove-target');
    const target = await circle(admin.cookie, 'Private circle');
    await join(target.code, removed.cookie);

    const result = await call(`/circles/${target.id}/members/${removed.id}/remove`, 'POST', admin.cookie);
    expect(result.response.status).toBe(200);
    expect(result.payload).toEqual({ success: true, data: null, error: null });
    expect(await db.circleRemovalBlock.count({ where: { circleId: target.id, memberId: removed.id } })).toBe(1);
    expect((await call(`/circles/${target.id}`, 'GET', removed.cookie)).response.status).toBe(404);
    expect((await call(`/circle-invites/${target.code}`, 'GET', removed.cookie)).payload.data).toEqual({ status: 'blocked' });
    const denied = await call(`/circle-invites/${target.code}/join`, 'POST', removed.cookie);
    expect(denied.response.status).toBe(403);
    expect(denied.payload.error.message).toBe("You can't join this circle.");
    expect(JSON.stringify(denied.payload)).not.toContain('Private circle');

    const reset = await call(`/circles/${target.id}/invite/reset`, 'POST', admin.cookie);
    const nextCode = (reset.payload.data.url as string).split('/').at(-1)!;
    expect((await call(`/circle-invites/${nextCode}`, 'GET', removed.cookie)).payload.data).toEqual({ status: 'blocked' });
    expect((await call(`/circle-invites/${nextCode}/join`, 'POST', removed.cookie)).response.status).toBe(403);
    expect((await call(`/circles/${target.id}/removals/clear`, 'POST', admin.cookie)).payload).toEqual({ success: true, data: null, error: null });
    expect(await db.circleRemovalBlock.count({ where: { circleId: target.id } })).toBe(0);
    expect((await call(`/circles/${target.id}`, 'GET', removed.cookie)).response.status).toBe(404);
    expect((await call(`/circle-invites/${nextCode}`, 'GET', removed.cookie)).payload.data).toEqual({ status: 'preview', name: 'Private circle', memberCount: 1 });
    await join(nextCode, removed.cookie);
    expect((await call(`/circles/${target.id}`, 'GET', removed.cookie)).response.status).toBe(200);
  });

  test('done-when-3 and 6: refusals, idempotent clearing, and visibility after removal', async () => {
    const admin = await member('rights-admin');
    const targetMember = await member('rights-target');
    const other = await member('rights-other');
    const outsider = await member('rights-outsider');
    const only = await circle(admin.cookie, 'Only shared');
    const also = await circle(admin.cookie, 'Still shared');
    await join(only.code, targetMember.cookie);
    await join(only.code, other.cookie);
    await join(also.code, targetMember.cookie);

    const removePath = `/circles/${only.id}/members/${targetMember.id}/remove`;
    const clearPath = `/circles/${only.id}/removals/clear`;
    for (const cookie of [other.cookie, outsider.cookie]) {
      for (const path of [removePath, clearPath]) {
        const denied = await call(path, 'POST', cookie);
        expect(denied.response.status).toBe(cookie === outsider.cookie ? 404 : 403);
      }
    }
    const selfRemoval = await call(`/circles/${only.id}/members/${admin.id}/remove`, 'POST', admin.cookie);
    expect(selfRemoval.response.status).toBe(403);
    expect(selfRemoval.payload.error).toMatchObject({ code: 'ADMIN_CANNOT_REMOVE_SELF', message: "You're the admin. To step away, leave the circle instead." });
    for (const path of ['/circles/bad-id/removals/clear', `/circles/${only.id}/members/bad-id/remove`]) {
      const invalid = await call(path, 'POST', outsider.cookie);
      expect(invalid.payload.error).toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    expect((await call(removePath, 'POST', admin.cookie)).response.status).toBe(200);
    expect((await call(removePath, 'POST', admin.cookie)).response.status).toBe(404);
    expect(await db.circleRemovalBlock.count({ where: { circleId: only.id, memberId: targetMember.id } })).toBe(1);
    expect((await call(`/circles/${only.id}`, 'GET', targetMember.cookie)).response.status).toBe(404);
    expect(JSON.stringify((await call(`/circles/${only.id}`, 'GET', targetMember.cookie)).payload)).not.toContain('rights-other');
    expect(JSON.stringify((await call(`/circles/${only.id}`, 'GET', admin.cookie)).payload)).not.toContain('rights-target');
    expect(JSON.stringify((await call(`/circles/${only.id}`, 'GET', other.cookie)).payload)).not.toContain('rights-target');
    for (const cookie of [admin.cookie, targetMember.cookie]) {
      const viewed = await call(`/circles/${also.id}`, 'GET', cookie);
      expect(JSON.stringify(viewed.payload)).toContain('rights-target');
      expect(JSON.stringify(viewed.payload)).toContain('rights-admin');
    }
    expect((await call(`/circles/${also.id}/members/${targetMember.id}/remove`, 'POST', admin.cookie)).response.status).toBe(200);
    expect(JSON.stringify((await call(`/circles/${also.id}`, 'GET', admin.cookie)).payload)).not.toContain('rights-target');
    expect(JSON.stringify((await call(`/circles/${also.id}`, 'GET', targetMember.cookie)).payload)).not.toContain('rights-admin');
    expect((await call(clearPath, 'POST', admin.cookie)).response.status).toBe(200);
    expect((await call(clearPath, 'POST', admin.cookie)).response.status).toBe(200);
    expect(await db.circleRemovalBlock.count({ where: { circleId: only.id } })).toBe(0);

    const departed = await member('rights-departed');
    await join(only.code, departed.cookie);
    expect((await call(`/circles/${only.id}/leave`, 'POST', departed.cookie)).response.status).toBe(200);
    expect((await call(`/circles/${only.id}/members/${departed.id}/remove`, 'POST', admin.cookie)).response.status).toBe(404);
    expect(await db.circleRemovalBlock.count({ where: { circleId: only.id, memberId: departed.id } })).toBe(0);
  });

  test('done-when-3: a Join already previewed cannot slip past a waiting removal', async () => {
    const admin = await member('race-remove-admin');
    const removed = await member('race-remove-member');
    const target = await circle(admin.cookie, 'Remove join race');
    await join(target.code, removed.cookie);
    expect((await call(`/circle-invites/${target.code}`, 'GET', removed.cookie)).payload.data.status).toBe('already_member');
    const [removal, joining] = await raceOnCircleLock(target.id, [
      { name: `${schemaName}_rjr`, path: `/circles/${target.id}/members/${removed.id}/remove`, cookie: admin.cookie },
      { name: `${schemaName}_rjj`, path: `/circle-invites/${target.code}/join`, cookie: removed.cookie },
    ]);
    expect(removal.response.status).toBe(200);
    expect(joining.response.status).toBe(403);
    expect(joining.payload.error.message).toBe("You can't join this circle.");
    expect(await db.circleMembership.count({ where: { circleId: target.id, memberId: removed.id } })).toBe(0);
    expect(await db.circleRemovalBlock.count({ where: { circleId: target.id, memberId: removed.id } })).toBe(1);
  }, 60_000);

  test('done-when-3: removal and voluntary leave of the same member serialize', async () => {
    const admin = await member('race-leave-admin');
    const departing = await member('race-leave-member');
    const target = await circle(admin.cookie, 'Remove leave race');
    await join(target.code, departing.cookie);
    const [removal, leaving] = await raceOnCircleLock(target.id, [
      { name: `${schemaName}_rlr`, path: `/circles/${target.id}/members/${departing.id}/remove`, cookie: admin.cookie },
      { name: `${schemaName}_rll`, path: `/circles/${target.id}/leave`, cookie: departing.cookie },
    ]);
    expect(removal.response.status).toBe(200);
    expect(leaving.response.status).toBe(404);
    expect(await db.circleMembership.count({ where: { circleId: target.id, memberId: departing.id } })).toBe(0);
    expect(await db.circleRemovalBlock.count({ where: { circleId: target.id, memberId: departing.id } })).toBe(1);
  }, 60_000);

  test.each(['remove', 'leave'] as const)('done-when-3 and 6: admin leaving and removal serialize with one successor when %s waits first', async (first) => {
    const admin = await member(`admin-leave-${first}-admin`);
    const targetMember = await member(`admin-leave-${first}-target`);
    const survivor = await member(`admin-leave-${first}-survivor`);
    const target = await circle(admin.cookie, `Admin leave remove ${first}`);
    await join(target.code, targetMember.cookie);
    await join(target.code, survivor.cookie);
    const remove = { name: `${schemaName}_${first}_ar`, path: `/circles/${target.id}/members/${targetMember.id}/remove`, cookie: admin.cookie };
    const leave = { name: `${schemaName}_${first}_al`, path: `/circles/${target.id}/leave`, cookie: admin.cookie };
    const [firstResult, secondResult] = await raceOnCircleLock(target.id, first === 'remove' ? [remove, leave] : [leave, remove]);
    expect(firstResult.response.status).toBe(200);
    expect(secondResult.response.status).toBe(first === 'remove' ? 200 : 404);
    const viewed = await call(`/circles/${target.id}`, 'GET', survivor.cookie);
    expect(viewed.response.status).toBe(200);
    const expectedMembers = first === 'remove' ? [survivor.id] : [targetMember.id, survivor.id];
    const expectedAdmin = first === 'remove' ? survivor.id : targetMember.id;
    expect(viewed.payload.data.members.map(({ id }: { id: string }) => id).sort()).toEqual(expectedMembers.sort());
    expect(viewed.payload.data.members.filter(({ isAdmin }: { isAdmin: boolean }) => isAdmin)).toEqual([expect.objectContaining({ id: expectedAdmin })]);
    const saved = await db.circle.findUniqueOrThrow({ where: { id: target.id }, include: { memberships: true } });
    expect(saved.deletedAtUtc).toBeNull();
    expect(saved.adminMemberId).toBe(expectedAdmin);
    expect(saved.memberships.map(({ memberId }: { memberId: string }) => memberId).sort()).toEqual(expectedMembers);
    expect(await db.circleRemovalBlock.count({ where: { circleId: target.id, memberId: targetMember.id } })).toBe(first === 'remove' ? 1 : 0);
  }, 60_000);

  test('done-when-3: clearing a block before a waiting Join permits only that explicit Join', async () => {
    const admin = await member('race-clear-admin');
    const removed = await member('race-clear-member');
    const target = await circle(admin.cookie, 'Clear join race');
    await join(target.code, removed.cookie);
    expect((await call(`/circles/${target.id}/members/${removed.id}/remove`, 'POST', admin.cookie)).response.status).toBe(200);
    const [cleared, joined] = await raceOnCircleLock(target.id, [
      { name: `${schemaName}_cjr`, path: `/circles/${target.id}/removals/clear`, cookie: admin.cookie },
      { name: `${schemaName}_cjj`, path: `/circle-invites/${target.code}/join`, cookie: removed.cookie },
    ]);
    expect(cleared.response.status).toBe(200);
    expect(joined.response.status).toBe(200);
    expect(await db.circleRemovalBlock.count({ where: { circleId: target.id, memberId: removed.id } })).toBe(0);
    expect(await db.circleMembership.count({ where: { circleId: target.id, memberId: removed.id } })).toBe(1);
  }, 60_000);
});
