import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_member_cards_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
databaseUrl.searchParams.set('application_name', `${schemaName}_api`);
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
  const signedIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: randomUUID(), email: 'listed@example.in', name });
  expect(signedIn.response.status).toBe(201);
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect((await call('/onboarding', 'POST', cookie, { displayName: name, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
  return { cookie, id: (await call('/members/me', 'GET', cookie)).payload.data.id as string };
}

async function circle(creator: Awaited<ReturnType<typeof member>>, ...others: Array<Awaited<ReturnType<typeof member>>>) {
  const created = await call('/circles', 'POST', creator.cookie, { name: 'Friends' });
  expect(created.response.status).toBe(201);
  const id = created.payload.data.id as string;
  if (others.length) {
    const invite = await call(`/circles/${id}/invite`, 'GET', creator.cookie);
    const code = (invite.payload.data.url as string).split('/').at(-1)!;
    for (const other of others) expect((await call(`/circle-invites/${code}/join`, 'POST', other.cookie)).response.status).toBe(200);
  }
  return id;
}

function view(circleId: string, targetId: string, cookie: string) {
  return call(`/circles/${circleId}/members/${targetId}/cards`, 'GET', cookie);
}

async function add(cookie: string, variant = 'Millennia') {
  const result = await call('/me/cards', 'POST', cookie, { bankId: 'hdfc-bank', type: 'credit', variant });
  expect(result.response.status).toBe(201);
  return result.payload.data.id as string;
}

function expectMissing(result: Awaited<ReturnType<typeof call>>) {
  expect(result.response.status).toBe(404);
  expect(result.payload).toMatchObject({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' } });
}

async function raceReadWithMembershipEnd(circleId: string, holderId: string, viewerCookie: string, end: () => Promise<Awaited<ReturnType<typeof call>>>) {
  const blockerUrl = new URL(databaseUrl);
  blockerUrl.searchParams.set('application_name', `${schemaName}_blocker`);
  const blockerDb = new PrismaClient({ datasources: { db: { url: blockerUrl.toString() } } });
  let release!: () => void;
  let ready!: (pid: number) => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const locked = new Promise<number>((resolve) => { ready = resolve; });
  const blocker = blockerDb.$transaction(async (tx) => {
    const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    await tx.$queryRaw`SELECT "id" FROM "Circle" WHERE "id" = ${circleId}::uuid FOR UPDATE`;
    ready(pid);
    await released;
  }, { timeout: 30_000 });
  let readPromise: ReturnType<typeof view> | undefined;
  let endPromise: ReturnType<typeof end> | undefined;
  let waitError: unknown;
  try {
    const blockerPid = await locked;
    const competitorPids = new Set<number>();
    const waitForCompetitor = async (label: string, mode: 'SHARE' | 'UPDATE') => {
      await vi.waitFor(async () => {
        const waiting = await db.$queryRaw<Array<{ pid: number; query: string; blockers: number[] }>>`
          SELECT pid, query, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
        const competitor = waiting.find(({ pid, query, blockers }) =>
          !competitorPids.has(pid) && blockers.some((other) => other === blockerPid || competitorPids.has(other)) && query.includes(`FOR ${mode}`));
        expect(competitor, `${label} never waited: ${JSON.stringify(waiting)}`).toBeDefined();
        competitorPids.add(competitor!.pid);
      }, { timeout: 8_000 });
    };
    readPromise = view(circleId, holderId, viewerCookie);
    await waitForCompetitor('member cards read', 'SHARE');
    endPromise = end();
    await waitForCompetitor('membership end', 'UPDATE');
    expect(competitorPids.size).toBe(2);
    const stillWaiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
      SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
      WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
    for (const pid of competitorPids) expect(stillWaiting.find((row) => row.pid === pid && row.blockers.some((other) => other === blockerPid || competitorPids.has(other))), `connection ${pid} stopped waiting`).toBeDefined();
  } catch (error) {
    waitError = error;
  } finally {
    release();
    try { await blocker; } finally { await blockerDb.$disconnect(); }
  }
  const [read, ended] = await Promise.all([readPromise, endPromise]);
  if (waitError) throw waitError;
  return { read: read!, ended: ended! };
}

describe('circle member cards API', () => {
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

  test('done-when-4: current circle members see the holder name and cards, including an empty list', async () => {
    const viewer = await member('Viewer');
    const holder = await member('Holder');
    const id = await circle(viewer, holder);
    expect((await view(id, holder.id, viewer.cookie)).payload.data).toEqual({ memberId: holder.id, displayName: 'Holder', cards: [] });
    const cardId = await add(holder.cookie);
    const result = await view(id, holder.id, viewer.cookie);
    expect(result.response.status).toBe(200);
    expect(result.payload.data).toEqual({ memberId: holder.id, displayName: 'Holder', cards: [{ id: cardId, bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'credit', variant: 'Millennia' }] });
    expect(JSON.stringify(result.payload)).not.toContain('9876543210');
  });

  test('done-when-4: a newly joined viewer sees an existing member’s earlier card', async () => {
    const holder = await member('Existing holder');
    const viewer = await member('New viewer');
    const id = await circle(holder);
    const cardId = await add(holder.cookie, 'Regalia');
    expectMissing(await view(id, holder.id, viewer.cookie));

    const invite = await call(`/circles/${id}/invite`, 'GET', holder.cookie);
    expect(invite.response.status).toBe(200);
    const code = (invite.payload.data.url as string).split('/').at(-1)!;
    expect((await call(`/circle-invites/${code}/join`, 'POST', viewer.cookie)).response.status).toBe(200);

    const result = await view(id, holder.id, viewer.cookie);
    expect(result.response.status).toBe(200);
    expect(result.payload.data).toEqual({
      memberId: holder.id,
      displayName: 'Existing holder',
      cards: [{ id: cardId, bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'credit', variant: 'Regalia' }],
    });
  });

  test('done-when-4: an existing viewer sees a newly joined holder’s earlier card and a second circle remains visible after one membership ends', async () => {
    const viewer = await member('Two circle viewer');
    const holder = await member('Two circle holder');
    const cardId = await add(holder.cookie, 'Regalia');
    const first = await circle(viewer, holder);
    const second = await circle(viewer, holder);
    for (const id of [first, second]) expect((await view(id, holder.id, viewer.cookie)).payload.data.cards[0].id).toBe(cardId);
    expect((await call(`/circles/${first}/leave`, 'POST', holder.cookie)).response.status).toBe(200);
    expectMissing(await view(first, holder.id, viewer.cookie));
    expect((await view(second, holder.id, viewer.cookie)).payload.data.cards[0].id).toBe(cardId);
  });

  test('done-when-4: unknown, unrelated, removed and deleted members and circles all refuse alike', async () => {
    const viewer = await member('Refusal viewer');
    const holder = await member('Refusal holder');
    const outsider = await member('Refusal outsider');
    const id = await circle(viewer, holder);
    const other = await circle(outsider);
    await add(holder.cookie);
    for (const result of [await view(id, outsider.id, viewer.cookie), await view(other, outsider.id, viewer.cookie), await view(randomUUID(), holder.id, viewer.cookie), await view(id, randomUUID(), viewer.cookie)]) expectMissing(result);
    expect((await call(`/circles/${id}/members/${holder.id}/remove`, 'POST', viewer.cookie)).response.status).toBe(200);
    expectMissing(await view(id, holder.id, viewer.cookie));
    const deleted = await circle(viewer, holder);
    expect((await call(`/circles/${deleted}`, 'DELETE', viewer.cookie)).response.status).toBe(200);
    expectMissing(await view(deleted, holder.id, viewer.cookie));
  });

  test('done-when-4: malformed circle and member ids return 400 before database access', async () => {
    const viewer = await member('Malformed viewer');
    const id = await circle(viewer);
    const transaction = vi.spyOn(db, '$transaction');
    try {
      for (const [circleId, memberId, field] of [['bad', viewer.id, 'circleId'], [id, 'bad', 'memberId']]) {
        const result = await view(circleId, memberId, viewer.cookie);
        expect(result.response.status).toBe(400);
        expect(result.payload.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field, reason: 'invalid_value' }] } });
      }
      expect(transaction).not.toHaveBeenCalled();
    } finally { transaction.mockRestore(); }
  });

  test('done-when-4 and 7: reloads show adds, edits, removals and a bank name correction in both views', async () => {
    const viewer = await member('Reload viewer');
    const holder = await member('Reload holder');
    const id = await circle(viewer, holder);
    expect((await view(id, holder.id, viewer.cookie)).payload.data.cards).toEqual([]);
    const cardId = await add(holder.cookie);
    expect((await view(id, holder.id, viewer.cookie)).payload.data.cards[0].variant).toBe('Millennia');
    expect((await call(`/me/cards/${cardId}`, 'PATCH', holder.cookie, { variant: 'Regalia' })).response.status).toBe(200);
    expect((await view(id, holder.id, viewer.cookie)).payload.data.cards[0].variant).toBe('Regalia');
    await db.bank.update({ where: { id: 'hdfc-bank' }, data: { displayName: 'HDFC Bank corrected' } });
    try {
      expect((await call('/me/cards', 'GET', holder.cookie)).payload.data.items[0].bankName).toBe('HDFC Bank corrected');
      expect((await view(id, holder.id, viewer.cookie)).payload.data.cards[0].bankName).toBe('HDFC Bank corrected');
    } finally { await db.bank.update({ where: { id: 'hdfc-bank' }, data: { displayName: 'HDFC Bank' } }); }
    expect((await call(`/me/cards/${cardId}`, 'DELETE', holder.cookie)).response.status).toBe(200);
    expect((await view(id, holder.id, viewer.cookie)).payload.data.cards).toEqual([]);
  });

  test.each(['leave', 'removal', 'deletion'] as const)('done-when-4: %s racing a read returns earlier cards or not-found, never later cards', async (change) => {
    const viewer = await member(`Race viewer ${change}`);
    const holder = await member(`Race holder ${change}`);
    const id = await circle(viewer, holder);
    const cardId = await add(holder.cookie);
    const end = change === 'leave'
      ? () => call(`/circles/${id}/leave`, 'POST', holder.cookie)
      : change === 'removal'
        ? () => call(`/circles/${id}/members/${holder.id}/remove`, 'POST', viewer.cookie)
        : () => call(`/circles/${id}`, 'DELETE', viewer.cookie);
    const { read, ended } = await raceReadWithMembershipEnd(id, holder.id, viewer.cookie, end);
    expect(ended.response.status).toBe(200);
    if (read.response.status === 200) {
      expect(read.payload.data.cards).toEqual([{ id: cardId, bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'credit', variant: 'Millennia' }]);
    } else expectMissing(read);
    expectMissing(await view(id, holder.id, viewer.cookie));
  });
});
