import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';
import { ServiceBus } from '../src/service-bus/service-bus.service';

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_cards_edit_${randomUUID().replace(/-/g, '')}`;
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

async function member(name: string, onboard = true) {
  const signedIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: name, email: 'listed@example.in', name });
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect(signedIn.response.status).toBe(201);
  if (!onboard) return { cookie, id: '' };
  expect((await call('/onboarding', 'POST', cookie, { displayName: name, whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
  return { cookie, id: (await call('/members/me', 'GET', cookie)).payload.data.id as string };
}

async function add(cookie: string, bankId: string, variant?: string) {
  const result = await call('/me/cards', 'POST', cookie, { bankId, type: 'credit', variant });
  expect(result.response.status, JSON.stringify(result.payload)).toBe(201);
  return result.payload.data.id as string;
}

function expectRefusal(result: Awaited<ReturnType<typeof call>>, status: number, code: string, message: string, field?: string) {
  const reason = code === 'VALIDATION_ERROR' ? field === 'cardId' ? 'invalid_value' : 'Choose credit or debit.' : message;
  expect(result.response.status).toBe(status);
  expect(result.payload).toMatchObject({ success: false, data: null, error: { code, statusCode: status, message, details: field ? { fieldErrors: [{ field, reason }] } : {} } });
  expect(result.payload.error.details).toEqual(field ? { fieldErrors: [{ field, reason }] } : {});
}

// Each API connection is named by its backend pid; both must be seen waiting before the lock is released.
async function blockedRequests(memberId: string, requests: Array<() => Promise<Awaited<ReturnType<typeof call>>>>) {
  const blockerUrl = new URL(databaseUrl);
  blockerUrl.searchParams.set('application_name', `${schemaName}_blocker`);
  const blockerDb = new PrismaClient({ datasources: { db: { url: blockerUrl.toString() } } });
  let release!: () => void;
  let ready!: (pid: number) => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const locked = new Promise<number>((resolve) => { ready = resolve; });
  const blocker = blockerDb.$transaction(async (tx) => {
    const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    await tx.$queryRaw`SELECT "id" FROM "Member" WHERE "id" = ${memberId}::uuid FOR UPDATE`;
    ready(pid);
    await released;
  }, { timeout: 30_000 });
  const pending: Array<Promise<Awaited<ReturnType<typeof call>>>> = [];
  const competitorPids = new Set<number>();
  let waitError: unknown;
  try {
    const blockerPid = await locked;
    for (const request of requests) {
      pending.push(request());
      await vi.waitFor(async () => {
        const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
          SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
        const next = waiting.find(({ pid, blockers }) => !competitorPids.has(pid) && (blockers.includes(blockerPid) || blockers.some((other) => competitorPids.has(other))));
        expect(next, JSON.stringify(waiting)).toBeDefined();
        competitorPids.add(next!.pid);
      }, { timeout: 4_000 });
    }
    expect(competitorPids.size).toBe(requests.length);
    const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
      SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
      WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
    for (const pid of competitorPids) {
      expect(waiting.find((row) => row.pid === pid && row.blockers.some((other) => other === blockerPid || competitorPids.has(other))), JSON.stringify(waiting)).toBeDefined();
    }
  } catch (error) {
    waitError = error;
  } finally {
    release();
    try { await blocker; } finally { await blockerDb.$disconnect(); }
  }
  const results = await Promise.all(pending);
  if (waitError) throw waitError;
  return results;
}

describe('edit and remove my cards API', () => {
  beforeEach(() => app.get<ThrottlerStorageService>(ThrottlerStorage).onApplicationShutdown());
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

  test('done-when-3: a member edits and removes their card without listing it again', async () => {
    const owner = await member('cards-edit-owner');
    const recorderProbe = await member('cards-edit-recorder-probe');
    const id = await add(owner.cookie, 'hdfc-bank', 'Millennia');
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: owner.id, type: 'card_listed' } })).toBe(1));
    const publish = vi.spyOn(app.get(ServiceBus), 'publish');
    try {
      const beforeEdit = await db.usageEvent.count();
      const edited = await call(`/me/cards/${id}`, 'PATCH', owner.cookie, { bankId: 'kotak-mahindra-bank', type: 'debit', variant: 'Kotak 811' });
      expect(edited.response.status).toBe(200);
      expect(edited.payload.data).toMatchObject({ id, bankId: 'kotak-mahindra-bank', bankName: 'Kotak Mahindra Bank', type: 'debit', variant: 'Kotak 811' });
      expect((await call('/me/cards', 'GET', owner.cookie)).payload.data.items).toEqual([edited.payload.data]);
      expect(await db.usageEvent.count()).toBe(beforeEdit);
      expect(publish).not.toHaveBeenCalled();
      await add(recorderProbe.cookie, 'axis-bank', 'Recorder probe one');
      await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: recorderProbe.id, type: 'card_listed' } })).toBe(1));
      expect(await db.usageEvent.count()).toBe(beforeEdit + 1);
      publish.mockClear();

      const beforeRemoval = await db.usageEvent.count();
      const removed = await call(`/me/cards/${id}`, 'DELETE', owner.cookie);
      expect(removed.response.status).toBe(200);
      expect(removed.payload).toMatchObject({ success: true, data: null, error: null });
      expect((await call('/me/cards', 'GET', owner.cookie)).payload.data.items).toEqual([]);
      expect(await db.usageEvent.count()).toBe(beforeRemoval);
      expect(publish).not.toHaveBeenCalled();
      await add(recorderProbe.cookie, 'canara-bank', 'Recorder probe two');
      await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: recorderProbe.id, type: 'card_listed' } })).toBe(2));
      expect(await db.usageEvent.count()).toBe(beforeRemoval + 1);
    } finally { publish.mockRestore(); }
  });

  test('done-when-3: edit refusals retain card data and place field and form errors', async () => {
    const owner = await member('cards-edit-refusals');
    const id = await add(owner.cookie, 'hdfc-bank', 'Millennia');
    const duplicateId = await add(owner.cookie, 'axis-bank', 'Neo');
    const unsafe = 'Private 123 456 789';
    const root = PinoLogger.root as unknown as Record<symbol, { write: (chunk: string) => boolean }>;
    const streamSymbol = Object.getOwnPropertySymbols(root).find((symbol) => symbol.toString() === 'Symbol(pino.stream)');
    expect(streamSymbol).toBeDefined();
    const destination = root[streamSymbol!];
    const lines: string[] = [];
    const write = destination.write.bind(destination);
    const capture = vi.spyOn(destination, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return write(chunk); });
    try {
      const cases = [
        [{ bankId: 'missing-bank', type: 'credit' }, 400, 'CARD_BANK_UNKNOWN', 'Choose a bank from the list.', 'bankId'],
        [{ bankId: 'hdfc-bank', type: 'charge' }, 400, 'VALIDATION_ERROR', 'Input validation failed.', 'type'],
        [{ bankId: 'hdfc-bank', type: 'credit', variant: 'a'.repeat(41) }, 400, 'CARD_VARIANT_TOO_LONG', 'Use at most 40 characters.', 'variant'],
        [{ bankId: 'hdfc-bank', type: 'credit', variant: unsafe }, 400, 'CARD_VARIANT_UNSAFE', 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.', 'variant'],
        [{ bankId: 'axis-bank', type: 'credit', variant: ' neo ' }, 409, 'CARD_DUPLICATE', "You've already listed this card.", undefined],
      ] as const;
      for (const [body, status, code, message, field] of cases) expectRefusal(await call(`/me/cards/${id}`, 'PATCH', owner.cookie, body), status, code, message, field);
      await vi.waitFor(() => expect(lines.join('')).toContain('API request completed'));
      expect(lines.join('')).not.toContain(unsafe);
      expect((await call('/me/cards', 'GET', owner.cookie)).payload.data.items).toMatchObject([{ id, variant: 'Millennia' }, { id: duplicateId, variant: 'Neo' }]);
    } finally { capture.mockRestore(); }
  });

  test('done-when-3: editing at twenty cards and editing to the same value succeeds', async () => {
    const owner = await member('cards-edit-limit');
    const banks = (await call('/banks?limit=100', 'GET', owner.cookie)).payload.data.items as Array<{ id: string }>;
    const ids: string[] = [];
    for (const bank of banks.slice(0, 20)) ids.push(await add(owner.cookie, bank.id));
    const self = await call(`/me/cards/${ids[0]}`, 'PATCH', owner.cookie, { bankId: banks[0].id, type: 'credit' });
    expect(self.response.status).toBe(200);
    const edited = await call(`/me/cards/${ids[0]}`, 'PATCH', owner.cookie, { bankId: banks[20].id, type: 'credit', variant: 'New variant' });
    expect(edited.response.status).toBe(200);
    expect(edited.payload.data).toMatchObject({ id: ids[0], bankId: banks[20].id, variant: 'New variant' });
    expect((await call('/me/cards', 'GET', owner.cookie)).payload.data.items).toHaveLength(20);
  });

  test('done-when-3: malformed, unknown and another member’s card ids never change a card', async () => {
    const owner = await member('cards-id-owner');
    const other = await member('cards-id-other');
    const id = await add(owner.cookie, 'hdfc-bank', 'Millennia');
    for (const method of ['PATCH', 'DELETE']) {
      const body = method === 'PATCH' ? { bankId: 'axis-bank', type: 'debit' } : undefined;
      expectRefusal(await call('/me/cards/not-a-uuid', method, owner.cookie, body), 400, 'VALIDATION_ERROR', 'Input validation failed.', 'cardId');
      for (const target of [randomUUID(), id]) {
        const cookie = target === id ? other.cookie : owner.cookie;
        expectRefusal(await call(`/me/cards/${target}`, method, cookie, body), 404, 'NOT_FOUND', 'The requested resource was not found.');
      }
    }
    expect((await call('/me/cards', 'GET', owner.cookie)).payload.data.items).toMatchObject([{ id, bankId: 'hdfc-bank', variant: 'Millennia' }]);
  });

  test('done-when-3: competing edits into one card produce one duplicate refusal', async () => {
    const owner = await member('cards-race-edit');
    const second = await member('cards-race-edit');
    const firstId = await add(owner.cookie, 'hdfc-bank', 'First');
    const secondId = await add(owner.cookie, 'hdfc-bank', 'Second');
    const results = await blockedRequests(owner.id, [
      () => call(`/me/cards/${firstId}`, 'PATCH', owner.cookie, { bankId: 'axis-bank', type: 'credit', variant: 'Neo' }),
      () => call(`/me/cards/${secondId}`, 'PATCH', second.cookie, { bankId: 'axis-bank', type: 'credit', variant: ' neo ' }),
    ]);
    expect(results.map(({ response }) => response.status).sort()).toEqual([200, 409]);
    expectRefusal(results.find(({ response }) => response.status === 409)!, 409, 'CARD_DUPLICATE', "You've already listed this card.");
  });

  test('done-when-3: edit and remove, and two removes, serialize against the same owner', async () => {
    const owner = await member('cards-race-remove');
    const second = await member('cards-race-remove');
    const editId = await add(owner.cookie, 'hdfc-bank', 'Edit');
    const [edited, removed] = await blockedRequests(owner.id, [
      () => call(`/me/cards/${editId}`, 'PATCH', owner.cookie, { bankId: 'axis-bank', type: 'credit', variant: 'Neo' }),
      () => call(`/me/cards/${editId}`, 'DELETE', second.cookie),
    ]);
    expect(edited.response.status).toBe(200);
    expect(removed.response.status).toBe(200);
    expect((await call('/me/cards', 'GET', owner.cookie)).payload.data.items).toEqual([]);
    const removeId = await add(owner.cookie, 'hdfc-bank', 'Remove');
    const results = await blockedRequests(owner.id, [
      () => call(`/me/cards/${removeId}`, 'DELETE', owner.cookie),
      () => call(`/me/cards/${removeId}`, 'DELETE', second.cookie),
    ]);
    expect(results.map(({ response }) => response.status).sort()).toEqual([200, 404]);
    expectRefusal(results.find(({ response }) => response.status === 404)!, 404, 'NOT_FOUND', 'The requested resource was not found.');
  });
});
