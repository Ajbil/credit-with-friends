import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';
import { findHolders } from '../src/modules/cards/find-holders.service';
import { UsageEventRecorder } from '../src/modules/usage/usage-event-recorder.service';
import { ServiceBus } from '../src/service-bus/service-bus.service';

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_search_${randomUUID().replace(/-/g, '')}`;
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

async function call(path: string, method = 'GET', cookie = '', body?: unknown, requestedWith = true) {
  const headers: Record<string, string> = { cookie };
  if (method !== 'GET') Object.assign(headers, { origin, 'content-type': 'application/json', ...(requestedWith && { 'x-requested-with': 'cwf' }) });
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

async function circle(name: string, creator: Awaited<ReturnType<typeof member>>, ...others: Array<Awaited<ReturnType<typeof member>>>) {
  const created = await call('/circles', 'POST', creator.cookie, { name });
  expect(created.response.status).toBe(201);
  const id = created.payload.data.id as string;
  if (others.length) {
    const invite = await call(`/circles/${id}/invite`, 'GET', creator.cookie);
    const code = (invite.payload.data.url as string).split('/').at(-1)!;
    for (const other of others) expect((await call(`/circle-invites/${code}/join`, 'POST', other.cookie)).response.status).toBe(200);
  }
  return id;
}

async function add(cookie: string, bankId = 'hdfc-bank', type = 'credit', variant?: string) {
  const added = await call('/me/cards', 'POST', cookie, { bankId, type, ...(variant !== undefined && { variant }) });
  expect(added.response.status, JSON.stringify(added.payload)).toBe(201);
  return added.payload.data.id as string;
}

function search(cookie: string, body: unknown = { bankId: 'hdfc-bank', type: 'credit' }, query = '') {
  return call(`/searches${query}`, 'POST', cookie, body);
}

type Result = Awaited<ReturnType<typeof call>>;
function items(result: Result) {
  expect(result.response.status, JSON.stringify(result.payload)).toBe(200);
  return result.payload.data.items as Array<{ memberId: string; displayName: string; group: string; circles: Array<{ id: string; name: string }>; cards: Array<{ id: string; bankId: string; bankName: string; type: string; variant: string | null }> }>;
}

function membershipEnd(change: 'leave' | 'removal' | 'deletion', circleId: string, shopper: Awaited<ReturnType<typeof member>>, holder: Awaited<ReturnType<typeof member>>) {
  return change === 'leave'
    ? () => call(`/circles/${circleId}/leave`, 'POST', holder.cookie)
    : change === 'removal'
      ? () => call(`/circles/${circleId}/members/${holder.id}/remove`, 'POST', shopper.cookie)
      : () => call(`/circles/${circleId}`, 'DELETE', shopper.cookie);
}

async function waitForLock(label: string, expectedBlockers: number[], excludedPids: number[] = [], queryText?: string) {
  let competitorPid = 0;
  await vi.waitFor(async () => {
    const waiting = await db.$queryRaw<Array<{ pid: number; query: string; blockers: number[] }>>`
      SELECT pid, query, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
      WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
    const competitor = waiting.find(({ pid, query, blockers }) =>
      !excludedPids.includes(pid) && blockers.some((blocker) => expectedBlockers.includes(blocker)) && (!queryText || query.includes(queryText)));
    expect(competitor, `${label} never waited: ${JSON.stringify(waiting)}`).toBeDefined();
    competitorPid = competitor!.pid;
  }, { timeout: 8_000 });
  return competitorPid;
}

describe('searches API', () => {
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

  test('done-when-1: one ordered person per holder with qualifying cards and shared circles', async () => {
    const shopper = await member('Shopper');
    const zara = await member('Zara');
    const amina = await member('amina');
    const outsider = await member('Outsider');
    const beta = await circle('Beta', shopper, zara, amina);
    const alpha = await circle('Alpha', shopper, zara);
    await circle('Elsewhere', outsider);
    const zaraCredit = await add(zara.cookie, 'hdfc-bank', 'credit', 'Regalia');
    const zaraDebit = await add(zara.cookie, 'hdfc-bank', 'debit');
    const aminaCredit = await add(amina.cookie, 'hdfc-bank', 'credit');
    await add(outsider.cookie, 'hdfc-bank', 'credit');
    await add(shopper.cookie, 'hdfc-bank', 'credit');
    expect(items(await search(shopper.cookie)).map(({ memberId }) => memberId)).toEqual([amina.id, zara.id]);
    const either = await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'any' });
    expect(items(either)).toEqual([
      { memberId: amina.id, displayName: 'amina', group: 'all', circles: [{ id: beta, name: 'Beta' }], cards: [{ id: aminaCredit, bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'credit', variant: null }] },
      { memberId: zara.id, displayName: 'Zara', group: 'all', circles: [{ id: alpha, name: 'Alpha' }, { id: beta, name: 'Beta' }], cards: expect.arrayContaining([
        { id: zaraCredit, bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'credit', variant: 'Regalia' },
        { id: zaraDebit, bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'debit', variant: null },
      ]) },
    ]);
    expect(items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'debit' })).map(({ memberId }) => memberId)).toEqual([zara.id]);
    expect(JSON.stringify(either.payload)).not.toContain('9876543210');
    const first = await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'any' }, '?page=1&limit=1');
    const second = await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'any' }, '?page=2&limit=1');
    expect(items(first).map(({ memberId }) => memberId)).toEqual([amina.id]);
    expect(items(second).map(({ memberId }) => memberId)).toEqual([zara.id]);
    expect(first.payload.data.pagination).toEqual({ page: 1, limit: 1, totalItems: 2, totalPages: 2 });
    expect(second.payload.data.pagination).toEqual({ page: 2, limit: 1, totalItems: 2, totalPages: 2 });
  });

  test('done-when-2: variant groups include each qualifying card, and blank searches use the full list', async () => {
    const shopper = await member('Variant shopper');
    const exact = await member('Z exact');
    const near = await member('A near');
    const blank = await member('B blank');
    await circle('Variant friends', shopper, exact, near, blank);
    const matching = await add(exact.cookie, 'hdfc-bank', 'credit', 'Flip-Kart');
    const similar = await add(exact.cookie, 'hdfc-bank', 'credit', 'flpkat');
    const unstated = await add(exact.cookie, 'hdfc-bank', 'credit');
    await add(near.cookie, 'hdfc-bank', 'credit', 'flipkat');
    await add(blank.cookie, 'hdfc-bank', 'credit');
    await add(blank.cookie, 'hdfc-bank', 'debit', 'Millennia');
    const found = items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: 'flip kart' }));
    expect(found.map(({ memberId, group }) => [memberId, group])).toEqual([[exact.id, 'matching'], [near.id, 'similar'], [blank.id, 'unstated']]);
    expect(found[0].cards.map(({ id }) => id).sort()).toEqual([matching, similar, unstated].sort());
    expect(items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: '!!!' })).map(({ group }) => group)).toEqual(['all', 'all', 'all']);
    expect(items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: '   ' })).map(({ group }) => group)).toEqual(['all', 'all', 'all']);
    const none = await search(shopper.cookie, { bankId: 'axis-bank', type: 'credit', variant: 'unknown' });
    expect(items(none)).toEqual([]);
    expect(none.payload.data.pagination).toMatchObject({ page: 1, totalItems: 0, totalPages: 0 });
  });

  test('done-when-1: additions, edits, removals and bank renames change the next search', async () => {
    const shopper = await member('Current shopper');
    const holder = await member('Current holder');
    await circle('Current friends', shopper, holder);
    expect(items(await search(shopper.cookie))).toEqual([]);
    const cardId = await add(holder.cookie, 'hdfc-bank', 'credit', 'Regalia');
    expect(items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: 'Regalia' }))[0].cards[0].id).toBe(cardId);
    expect((await call(`/me/cards/${cardId}`, 'PATCH', holder.cookie, { variant: 'Millennia' })).response.status).toBe(200);
    expect(items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: 'Regalia' }))).toEqual([]);
    expect(items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: 'Millennia' }))[0].cards[0].id).toBe(cardId);
    await db.bank.update({ where: { id: 'hdfc-bank' }, data: { displayName: 'HDFC renamed' } });
    try {
      expect(items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: 'Millennia' }))[0].cards[0].bankName).toBe('HDFC renamed');
    } finally { await db.bank.update({ where: { id: 'hdfc-bank' }, data: { displayName: 'HDFC Bank' } }); }
    expect((await call(`/me/cards/${cardId}`, 'DELETE', holder.cookie)).response.status).toBe(200);
    expect(items(await search(shopper.cookie))).toEqual([]);
  });

  test('done-when-2: invalid criteria and paging are refused beside the field, without retaining the variant', async () => {
    const shopper = await member('Refusal shopper');
    const unsafe = 'Private 123 456 789';
    const root = PinoLogger.root as unknown as Record<symbol, { write: (chunk: string) => boolean }>;
    const streamSymbol = Object.getOwnPropertySymbols(root).find((symbol) => symbol.toString() === 'Symbol(pino.stream)');
    expect(streamSymbol).toBeDefined();
    const destination = root[streamSymbol!];
    const lines: string[] = [];
    const write = destination.write.bind(destination);
    const capture = vi.spyOn(destination, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return write(chunk); });
    try {
      for (const [body, code, field] of [
        [{ bankId: 'missing-bank', type: 'credit' }, 'CARD_BANK_UNKNOWN', 'bankId'],
        [{ bankId: 'hdfc-bank', type: 'credit', variant: 'x'.repeat(41) }, 'CARD_VARIANT_TOO_LONG', 'variant'],
        [{ bankId: 'hdfc-bank', type: 'credit', variant: unsafe }, 'CARD_VARIANT_UNSAFE', 'variant'],
        [{ bankId: 'hdfc-bank', type: 'credit', variant: '811' }, 'CARD_VARIANT_UNSAFE', 'variant'],
        [{ type: 'credit' }, 'VALIDATION_ERROR', 'bankId'],
        [{ bankId: 12, type: 'credit' }, 'VALIDATION_ERROR', 'bankId'],
        [{ bankId: 'hdfc-bank', type: 'charge' }, 'VALIDATION_ERROR', 'type'],
        [{ bankId: 'hdfc-bank' }, 'VALIDATION_ERROR', 'type'],
      ] as const) {
        const refused = await search(shopper.cookie, body);
        expect(refused.response.status).toBe(400);
        expect(refused.payload.error).toMatchObject({ code, details: { fieldErrors: [expect.objectContaining({ field })] } });
      }
      for (const [query, field] of [['?page=0', 'page'], ['?limit=101', 'limit'], ['?sortBy=name', 'sortBy']] as const) {
        const refused = await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit' }, query);
        expect(refused.response.status).toBe(400);
        expect(refused.payload.error.details.fieldErrors).toEqual([expect.objectContaining({ field })]);
      }
      expect(items(await search(shopper.cookie, { bankId: 'kotak-mahindra-bank', type: 'credit', variant: 'Kotak 811' }))).toEqual([]);
      expect((await call('/searches', 'POST', shopper.cookie, { bankId: 'hdfc-bank', type: 'credit' }, false)).response.status).toBe(403);
      expect((await search('', { bankId: 'hdfc-bank', type: 'credit' })).response.status).toBe(401);
      await vi.waitFor(() => expect(lines.some((line) => line.includes('API request completed'))).toBe(true));
      expect(lines.join('')).not.toContain(unsafe);
      const privateVariant = 'Private Flipkart';
      expect(items(await search(shopper.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: privateVariant }))).toEqual([]);
      await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: shopper.id, type: 'search' } })).toBe(2));
      expect(lines.join('')).not.toContain(privateVariant);
      expect(await db.usageEvent.count({ where: { memberId: shopper.id, type: 'search' } })).toBe(2);
    } finally { capture.mockRestore(); }
  });

  test('done-when-1: search permits 60 requests per member each minute', async () => {
    const first = await member('Rate first');
    const second = await member('Rate second');
    for (let request = 0; request < 60; request += 1) {
      expect((await search(first.cookie, { bankId: 'hdfc-bank', type: 'invalid' })).response.status).toBe(400);
    }
    expect((await search(first.cookie, { bankId: 'hdfc-bank', type: 'invalid' })).response.status).toBe(429);
    expect((await search(second.cookie, { bankId: 'hdfc-bank', type: 'invalid' })).response.status).toBe(400);
  });

  test('done-when-1: one page-one event records distinct circles and the total people, with no variant', async () => {
    const shopper = await member('Event shopper');
    const holder = await member('Event holder');
    const first = await circle('Event first', shopper, holder);
    const second = await circle('Event second', shopper, holder);
    await add(holder.cookie, 'axis-bank', 'debit', 'Neo');
    const firstPage = await search(shopper.cookie, { bankId: 'axis-bank', type: 'any', variant: 'Neo' }, '?page=1&limit=1');
    expect(items(firstPage)).toHaveLength(1);
    expect(items(await search(shopper.cookie, { bankId: 'axis-bank', type: 'any', variant: 'Neo' }, '?page=2&limit=1'))).toEqual([]);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: shopper.id, type: 'search' } })).toBe(1));
    const event = await db.usageEvent.findFirstOrThrow({ where: { memberId: shopper.id, type: 'search' }, include: { circles: true } });
    expect(event).toMatchObject({ bankId: 'axis-bank', cardType: 'either', peopleFound: 1 });
    expect(event.circles.map(({ circleId }) => circleId).sort()).toEqual([first, second].sort());
    expect(JSON.stringify(event)).not.toContain('Neo');
  });

  test('done-when-1: a held or failed usage recorder never delays or refuses search', async () => {
    const shopper = await member('Nonblocking shopper');
    const holder = await member('Nonblocking holder');
    await circle('Nonblocking friends', shopper, holder);
    await add(holder.cookie);
    const lockUrl = new URL(databaseUrl);
    lockUrl.searchParams.set('application_name', `${schemaName}_recorder_blocker`);
    const lockDb = new PrismaClient({ datasources: { db: { url: lockUrl.toString() } } });
    let release!: () => void;
    let ready!: (pid: number) => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<number>((resolve) => { ready = resolve; });
    const blocker = lockDb.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      await tx.$executeRaw`LOCK TABLE "UsageEvent" IN ACCESS EXCLUSIVE MODE`;
      ready(pid);
      await released;
    }, { timeout: 30_000 });
    try {
      const blockerPid = await locked;
      const found = await search(shopper.cookie);
      expect(items(found).map(({ memberId }) => memberId)).toEqual([holder.id]);
      await vi.waitFor(async () => {
        const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
          SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
        expect(waiting.find(({ blockers }) => blockers.includes(blockerPid)), JSON.stringify(waiting)).toBeDefined();
      }, { timeout: 8_000 });
    } finally {
      release();
      try { await blocker; } finally { await lockDb.$disconnect(); }
    }
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: shopper.id, type: 'search' } })).toBe(1));
    await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" ADD CONSTRAINT "test_search_recorder_failure" CHECK (type <> \'search\') NOT VALID');
    const warn = vi.spyOn(app.get(UsageEventRecorder)['logger'], 'warn');
    try {
      const found = await search(shopper.cookie);
      expect(items(found).map(({ memberId }) => memberId)).toEqual([holder.id]);
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ eventName: 'CardSearchedEvent', outcome: 'failed' }) }), 'Usage event recording failed'));
      expect(await db.usageEvent.count({ where: { memberId: shopper.id, type: 'search' } })).toBe(1);
    } finally {
      warn.mockRestore();
      await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" DROP CONSTRAINT "test_search_recorder_failure"');
    }
  });

  test.each(['leave', 'removal', 'deletion'] as const)('done-when-1: %s racing a search yields the committed earlier or later membership', async (change) => {
    const shopper = await member(`Race shopper ${change}`);
    const holder = await member(`Race holder ${change}`);
    const circleId = await circle(`Race ${change}`, shopper, holder);
    const cardId = await add(holder.cookie);
    const lockUrl = new URL(databaseUrl);
    lockUrl.searchParams.set('application_name', `${schemaName}_${change}_blocker`);
    const lockDb = new PrismaClient({ datasources: { db: { url: lockUrl.toString() } } });
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
    let searchRequest: ReturnType<typeof search> | undefined;
    let endRequest: ReturnType<ReturnType<typeof membershipEnd>> | undefined;
    let waitError: unknown;
    try {
      const blockerPid = await locked;
      searchRequest = search(shopper.cookie);
      const searchPid = await waitForLock('search', [blockerPid], [], 'FOR SHARE');
      endRequest = membershipEnd(change, circleId, shopper, holder)();
      // PostgreSQL can queue the writer behind the waiting search instead of the row owner.
      const endPid = await waitForLock(`${change} membership end`, [blockerPid, searchPid], [searchPid], 'FOR UPDATE');
      const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
        SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
      for (const pid of [searchPid, endPid]) {
        expect(waiting.find((row) => row.pid === pid && row.blockers.some((blocker) => blocker === blockerPid || blocker === searchPid || blocker === endPid)), `connection ${pid} stopped waiting`).toBeDefined();
      }
    } catch (error) { waitError = error; }
    finally {
      release();
      try { await blocker; } finally { await lockDb.$disconnect(); }
    }
    const [found, ended] = await Promise.all([searchRequest, endRequest]);
    if (waitError) throw waitError;
    expect(ended!.response.status).toBe(200);
    const result = items(found!);
    expect(result.length === 0 || (result.length === 1 && result[0].memberId === holder.id && result[0].cards[0].id === cardId)).toBe(true);
    expect(items(await search(shopper.cookie))).toEqual([]);
  });

  test.each(['leave', 'removal', 'deletion'] as const)('done-when-1: read-first %s waits for search to answer with the earlier membership', async (change) => {
    const shopper = await member(`Read-first shopper ${change}`);
    const holder = await member(`Read-first holder ${change}`);
    const circleId = await circle(`Read-first ${change}`, shopper, holder);
    const cardId = await add(holder.cookie);
    const bus = app.get(ServiceBus);
    let release!: () => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    let readPid = 0;
    bus.registerRequest('cards.findHolders', async ({ memberIds, bankId, type, variant, tx }) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      readPid = pid;
      await paused;
      return findHolders(memberIds, bankId, type, variant, tx);
    });
    let searchRequest: ReturnType<typeof search> | undefined;
    let endRequest: ReturnType<ReturnType<typeof membershipEnd>> | undefined;
    try {
      let searchAnswered = false;
      let endAnswered = false;
      searchRequest = search(shopper.cookie);
      void searchRequest.then(() => { searchAnswered = true; });
      await vi.waitFor(() => expect(readPid).toBeGreaterThan(0), { timeout: 8_000 });
      endRequest = membershipEnd(change, circleId, shopper, holder)();
      void endRequest.then(() => { endAnswered = true; });
      const endPid = await waitForLock(`${change} membership end`, [readPid], [], 'FOR UPDATE');
      const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
        SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
      expect(waiting.find(({ pid, blockers }) => pid === endPid && blockers.includes(readPid)), `connection ${endPid} stopped waiting`).toBeDefined();
      expect(searchAnswered).toBe(false);
      expect(endAnswered).toBe(false);
      release();
      expect(items(await searchRequest).map(({ cards, memberId }) => [memberId, cards[0].id])).toEqual([[holder.id, cardId]]);
      expect((await endRequest).response.status).toBe(200);
      expect(searchAnswered).toBe(true);
      expect(endAnswered).toBe(true);
      expect(items(await search(shopper.cookie))).toEqual([]);
    } finally {
      release();
      await Promise.allSettled([searchRequest, endRequest].filter((promise) => promise !== undefined));
      bus.registerRequest('cards.findHolders', ({ memberIds, bankId, type, variant, tx }) => findHolders(memberIds, bankId, type, variant, tx));
    }
  });
});
