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
import { UsageEventRecorder } from '../src/modules/usage/usage-event-recorder.service';

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_cards_add_${randomUUID().replace(/-/g, '')}`;
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

async function add(cookie: string, body: unknown) { return call('/me/cards', 'POST', cookie, body); }

async function blockedRequests(memberId: string, requests: Array<() => Promise<Awaited<ReturnType<typeof call>>>>, membershipId?: string) {
  const lockUrl = new URL(databaseUrl);
  lockUrl.searchParams.set('application_name', `${schemaName}_blocker`);
  const lockDb = new PrismaClient({ datasources: { db: { url: lockUrl.toString() } } });
  let release!: () => void;
  let ready!: (pid: number) => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const locked = new Promise<number>((resolve) => { ready = resolve; });
  const blocker = lockDb.$transaction(async (tx) => {
    const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
    await tx.$queryRaw`SELECT "id" FROM "Member" WHERE "id" = ${memberId}::uuid FOR UPDATE`;
    if (membershipId) await tx.$queryRaw`SELECT "id" FROM "CircleMembership" WHERE "id" = ${membershipId}::uuid FOR UPDATE`;
    ready(pid);
    await released;
  }, { timeout: 30_000 });
  const pending: Array<Promise<Awaited<ReturnType<typeof call>>>> = [];
  let waitError: unknown;
  try {
    const blockerPid = await locked;
    for (const [index, request] of requests.entries()) {
      pending.push(request());
      await vi.waitFor(async () => {
        const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
          SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
        const competitorPids = new Set(waiting.map(({ pid }) => pid));
        expect(competitorPids.size, JSON.stringify(waiting)).toBe(index + 1);
        expect(waiting.some(({ blockers }) => blockers.includes(blockerPid))).toBe(true);
        expect(waiting.every(({ blockers }) => blockers.some((pid) => pid === blockerPid || competitorPids.has(pid)))).toBe(true);
      }, { timeout: 4_000 });
    }
  } catch (error) {
    waitError = error;
  } finally {
    release();
    try { await blocker; } finally { await lockDb.$disconnect(); }
  }
  const results = await Promise.all(pending);
  if (waitError) throw waitError;
  return results;
}

describe('my cards API', () => {
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

  test('done-when-1: a member outside circles adds a card from every listed bank and sees each card', async () => {
    const owners = await Promise.all([member('cards-no-circle-1'), member('cards-no-circle-2'), member('cards-no-circle-3')]);
    const banks = (await call('/banks?limit=100', 'GET', owners[0].cookie)).payload.data.items as Array<{ id: string; displayName: string }>;
    expect(banks).toHaveLength(57);
    for (const [index, bank] of banks.entries()) {
      const owner = owners[Math.floor(index / 20)];
      const added = await add(owner.cookie, { bankId: bank.id, type: 'debit' });
      expect(added.response.status, JSON.stringify(added.payload)).toBe(201);
      expect(added.payload.data).toMatchObject({ bankId: bank.id, bankName: bank.displayName, type: 'debit', variant: null });
    }
    for (const [index, owner] of owners.entries()) {
      const listed = await call('/me/cards', 'GET', owner.cookie);
      expect(listed.response.status).toBe(200);
      expect(listed.payload.data.items.map(({ bankId }: { bankId: string }) => bankId)).toEqual(banks.slice(index * 20, index * 20 + 20).map(({ id }) => id));
      expect(listed.payload.data.pagination).toMatchObject({ page: 1, limit: 20, totalItems: listed.payload.data.items.length, totalPages: 1 });
      expect(await db.circleMembership.count({ where: { memberId: owner.id } })).toBe(0);
    }
    const pending = await member('cards-pending', false);
    for (const result of [await call('/me/cards', 'GET', pending.cookie), await add(pending.cookie, { bankId: banks[0].id, type: 'credit' })]) {
      expect(result.response.status).toBe(403);
      expect(result.payload.error.code).toBe('FORBIDDEN');
    }
  });

  test('done-when-2: card input refusals carry the correct code, message and placement', async () => {
    const owner = await member('cards-refusals');
    const cases = [
      [{ bankId: 'not-a-bank', type: 'credit' }, 400, 'CARD_BANK_UNKNOWN', 'Choose a bank from the list.', 'bankId'],
      [{ bankId: 'hdfc-bank', type: 'credit', variant: 'a'.repeat(41) }, 400, 'CARD_VARIANT_TOO_LONG', 'Use at most 40 characters.', 'variant'],
      [{ bankId: 'hdfc-bank', type: 'credit', variant: '12 34' }, 400, 'CARD_VARIANT_UNSAFE', 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.', 'variant'],
      [{ bankId: 'kotak-mahindra-bank', type: 'credit', variant: 'CVV 811' }, 400, 'CARD_VARIANT_UNSAFE', 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.', 'variant'],
      [{ bankId: 'hdfc-bank', type: 'credit', variant: '811' }, 400, 'CARD_VARIANT_UNSAFE', 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.', 'variant'],
    ] as const;
    for (const [body, status, code, message, field] of cases) {
      const refused = await add(owner.cookie, body);
      expect(refused.response.status).toBe(status);
      expect(refused.payload.error).toMatchObject({ code, message, details: { fieldErrors: [{ field, reason: message }] } });
    }
    expect(await db.card.count({ where: { memberId: owner.id } })).toBe(0);
    for (const body of [{ type: 'credit' }, { bankId: 12, type: 'credit' }, { bankId: 'hdfc-bank' }, { bankId: 'hdfc-bank', type: 'charge' }]) {
      const refused = await add(owner.cookie, body);
      expect(refused.response.status).toBe(400);
      expect(refused.payload.error.code).toBe('VALIDATION_ERROR');
      expect(refused.payload.error.details.fieldErrors).toEqual([expect.objectContaining({ field: 'bankId' in body && body.bankId === 'hdfc-bank' ? 'type' : 'bankId' })]);
    }
    const first = await add(owner.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: '  Millennia  ' });
    expect(first.response.status).toBe(201);
    const duplicate = await add(owner.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: 'millennia' });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.payload.error).toMatchObject({ code: 'CARD_DUPLICATE', message: "You've already listed this card.", details: {} });
    expect((await add(owner.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: 'Regalia' })).response.status).toBe(201);
    expect((await add(owner.cookie, { bankId: 'kotak-mahindra-bank', type: 'credit', variant: 'Kotak 811' })).response.status).toBe(201);
    expect(await db.card.count({ where: { memberId: owner.id } })).toBe(3);
  });

  test('done-when-6: adding a card records one event for a member with no circle', async () => {
    const owner = await member('cards-event-no-circle');
    expect((await add(owner.cookie, { bankId: 'hdfc-bank', type: 'credit' })).response.status).toBe(201);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { type: 'card_listed', memberId: owner.id } })).toBe(1));
    const event = await db.usageEvent.findFirstOrThrow({ where: { type: 'card_listed', memberId: owner.id }, include: { circles: true } });
    expect(event.circles).toEqual([]);
  });

  test('done-when-6: the event carries the circles at add time and recording does not hold the response', async () => {
    const owner = await member('cards-event-circles');
    const first = await call('/circles', 'POST', owner.cookie, { name: 'Cards circle one' });
    const second = await call('/circles', 'POST', owner.cookie, { name: 'Cards circle two' });
    expect(first.response.status).toBe(201);
    expect(second.response.status).toBe(201);
    const added = await add(owner.cookie, { bankId: 'axis-bank', type: 'debit' });
    expect(added.response.status).toBe(201);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: owner.id, type: 'card_listed' } })).toBe(1));
    const event = await db.usageEvent.findFirstOrThrow({ where: { memberId: owner.id, type: 'card_listed' }, include: { circles: true } });
    expect(event.circles.map(({ circleId }) => circleId).sort()).toEqual([first.payload.data.id, second.payload.data.id].sort());

    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    app.get(ServiceBus).registerEvent('CardListedEvent', async () => { await held; });
    try {
      const next = await add(owner.cookie, { bankId: 'canara-bank', type: 'credit' });
      expect(next.response.status).toBe(201);
      expect(await db.card.count({ where: { memberId: owner.id } })).toBe(2);
    } finally {
      release();
    }
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: owner.id, type: 'card_listed' } })).toBe(2));
  });

  test('done-when-2: simultaneous identical adds produce one card and one duplicate refusal', async () => {
    const owner = await member('cards-duplicate-race');
    const secondSession = await member('cards-duplicate-race');
    const results = await blockedRequests(owner.id, [
      () => add(owner.cookie, { bankId: 'axis-bank', type: 'credit', variant: 'Neo' }),
      () => add(secondSession.cookie, { bankId: 'axis-bank', type: 'credit', variant: ' neo ' }),
    ]);
    expect(results.map(({ response }) => response.status).sort()).toEqual([201, 409]);
    expect(results.find(({ response }) => response.status === 409)?.payload.error).toMatchObject({ code: 'CARD_DUPLICATE', message: "You've already listed this card.", details: {} });
    expect(await db.card.count({ where: { memberId: owner.id } })).toBe(1);
  });

  test('done-when-2: simultaneous adds at the limit allow only the twentieth card', async () => {
    const owner = await member('cards-limit-race');
    const secondSession = await member('cards-limit-race');
    const banks = (await call('/banks?limit=100', 'GET', owner.cookie)).payload.data.items as Array<{ id: string }>;
    for (const bank of banks.slice(0, 19)) expect((await add(owner.cookie, { bankId: bank.id, type: 'credit' })).response.status).toBe(201);
    const results = await blockedRequests(owner.id, [
      () => add(owner.cookie, { bankId: banks[19].id, type: 'credit' }),
      () => add(secondSession.cookie, { bankId: banks[20].id, type: 'credit' }),
    ]);
    expect(results.map(({ response }) => response.status).sort()).toEqual([201, 409]);
    expect(results.find(({ response }) => response.status === 409)?.payload.error).toMatchObject({ code: 'CARD_LIMIT', message: 'You can list at most 20 cards.', details: {} });
    expect(await db.card.count({ where: { memberId: owner.id } })).toBe(20);
  });

  test('done-when-2: a refused card-like variant is absent from cards and logs', async () => {
    const owner = await member('cards-private-refusal');
    const unsafe = 'Private 123 456 789';
    const root = PinoLogger.root as unknown as Record<symbol, { write: (chunk: string) => boolean }>;
    const streamSymbol = Object.getOwnPropertySymbols(root).find((symbol) => symbol.toString() === 'Symbol(pino.stream)');
    expect(streamSymbol).toBeDefined();
    const destination = root[streamSymbol!];
    const lines: string[] = [];
    const write = destination.write.bind(destination);
    const capture = vi.spyOn(destination, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return write(chunk); });
    try {
      const refused = await add(owner.cookie, { bankId: 'hdfc-bank', type: 'credit', variant: unsafe });
      expect(refused.response.status).toBe(400);
      expect(refused.payload.error.code).toBe('CARD_VARIANT_UNSAFE');
      expect(await db.card.count({ where: { memberId: owner.id } })).toBe(0);
      await vi.waitFor(() => expect(lines.join('')).toContain(refused.payload.error.correlationId));
      expect(lines.some((line) => line.includes('API request completed'))).toBe(true);
      expect(lines.join('')).not.toContain(unsafe);
    } finally {
      capture.mockRestore();
    }
  });

  test('done-when-6: an add racing a join counts the joined circle after both competitors wait', async () => {
    const admin = await member('cards-join-admin');
    const target = await member('cards-join-target');
    const targetSecondSession = await member('cards-join-target');
    const circle = await call('/circles', 'POST', admin.cookie, { name: 'Joining cards' });
    expect(circle.response.status).toBe(201);
    const invite = await call(`/circles/${circle.payload.data.id}/invite`, 'GET', admin.cookie);
    const code = (invite.payload.data.url as string).split('/').at(-1)!;
    const [joined, added] = await blockedRequests(target.id, [
      () => call(`/circle-invites/${code}/join`, 'POST', target.cookie),
      () => add(targetSecondSession.cookie, { bankId: 'hdfc-bank', type: 'debit' }),
    ]);
    expect(joined.response.status).toBe(200);
    expect(added.response.status).toBe(201);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: target.id, type: 'card_listed' } })).toBe(1));
    const event = await db.usageEvent.findFirstOrThrow({ where: { memberId: target.id, type: 'card_listed' }, include: { circles: true } });
    expect(event.circles.map(({ circleId }) => circleId)).toEqual([circle.payload.data.id]);
  });

  test('done-when-6: an add racing a leave snapshots the membership after both competitors wait', async () => {
    const admin = await member('cards-leave-admin');
    const target = await member('cards-leave-target');
    const targetSecondSession = await member('cards-leave-target');
    const circle = await call('/circles', 'POST', admin.cookie, { name: 'Leaving cards' });
    const invite = await call(`/circles/${circle.payload.data.id}/invite`, 'GET', admin.cookie);
    const code = (invite.payload.data.url as string).split('/').at(-1)!;
    expect((await call(`/circle-invites/${code}/join`, 'POST', target.cookie)).response.status).toBe(200);
    const membership = await db.circleMembership.findUniqueOrThrow({ where: { circleId_memberId: { circleId: circle.payload.data.id, memberId: target.id } } });
    const [left, added] = await blockedRequests(target.id, [
      () => call(`/circles/${circle.payload.data.id}/leave`, 'POST', target.cookie),
      () => add(targetSecondSession.cookie, { bankId: 'hdfc-bank', type: 'debit' }),
    ], membership.id);
    expect(left.response.status).toBe(200);
    expect(added.response.status).toBe(201);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: target.id, type: 'card_listed' } })).toBe(1));
    const event = await db.usageEvent.findFirstOrThrow({ where: { memberId: target.id, type: 'card_listed' }, include: { circles: true } });
    expect(event.circles).toEqual([]);
  });

  test('done-when-6: a leave waits behind an add that already captured its circle', async () => {
    const admin = await member('cards-add-first-admin');
    const target = await member('cards-add-first-target');
    const secondSession = await member('cards-add-first-target');
    const circle = await call('/circles', 'POST', admin.cookie, { name: 'Add before leave' });
    expect(circle.response.status).toBe(201);
    const circleId = circle.payload.data.id as string;
    const invite = await call(`/circles/${circleId}/invite`, 'GET', admin.cookie);
    const code = (invite.payload.data.url as string).split('/').at(-1)!;
    expect((await call(`/circle-invites/${code}/join`, 'POST', target.cookie)).response.status).toBe(200);

    const lockUrl = new URL(databaseUrl);
    lockUrl.searchParams.set('application_name', `${schemaName}_card_hold`);
    const lockDb = new PrismaClient({ datasources: { db: { url: lockUrl.toString() } } });
    let release!: () => void;
    let ready!: (pid: number) => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<number>((resolve) => { ready = resolve; });
    const blocker = lockDb.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      await tx.$executeRaw`LOCK TABLE "Card" IN ACCESS EXCLUSIVE MODE`;
      ready(pid);
      await released;
    }, { timeout: 30_000 });
    let addRequest: ReturnType<typeof add> | undefined;
    let leaveRequest: ReturnType<typeof call> | undefined;
    let waitError: unknown;
    try {
      const blockerPid = await locked;
      addRequest = add(secondSession.cookie, { bankId: 'hdfc-bank', type: 'debit' });
      let addPid = 0;
      await vi.waitFor(async () => {
        const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
          SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
        const addWait = waiting.find(({ blockers }) => blockers.includes(blockerPid));
        expect(addWait, JSON.stringify(waiting)).toBeDefined();
        addPid = addWait!.pid;
      }, { timeout: 4_000 });
      leaveRequest = call(`/circles/${circleId}/leave`, 'POST', target.cookie);
      await vi.waitFor(async () => {
        const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
          SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
          WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
        expect(waiting.find(({ pid, blockers }) => pid !== addPid && blockers.includes(addPid)), JSON.stringify(waiting)).toBeDefined();
      }, { timeout: 4_000 });
    } catch (error) {
      waitError = error;
    } finally {
      release();
      try { await blocker; } finally { await lockDb.$disconnect(); }
    }
    const [added, left] = await Promise.all([addRequest, leaveRequest]);
    if (waitError) throw waitError;
    expect(added?.response.status).toBe(201);
    expect(left?.response.status).toBe(200);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { memberId: target.id, type: 'card_listed' } })).toBe(1));
    const event = await db.usageEvent.findFirstOrThrow({ where: { memberId: target.id, type: 'card_listed' }, include: { circles: true } });
    expect(event.circles.map(({ circleId: eventCircleId }) => eventCircleId)).toEqual([circleId]);
    expect(await db.circleMembership.count({ where: { memberId: target.id, circleId } })).toBe(0);
  });

  test('done-when-6: recording the same event twice counts it once', async () => {
    const owner = await member('cards-idempotent-event');
    const event = { id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: owner.id, data: { circleIds: [] } };
    const bus = app.get(ServiceBus);
    await bus.publish('CardListedEvent', event);
    await bus.publish('CardListedEvent', event);
    expect(await db.usageEvent.count({ where: { id: event.id, type: 'card_listed' } })).toBe(1);
  });

  test('done-when-6: a failed usage write is logged and does not undo the card', async () => {
    const owner = await member('cards-recorder-failure');
    const warn = vi.spyOn(app.get(UsageEventRecorder)['logger'], 'warn');
    await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" ADD CONSTRAINT "test_record_failure" CHECK (type <> \'card_listed\') NOT VALID');
    try {
      const added = await add(owner.cookie, { bankId: 'hdfc-bank', type: 'debit' });
      expect(added.response.status).toBe(201);
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ eventName: 'CardListedEvent', outcome: 'failed' }) }), 'Usage event recording failed'));
      expect(await db.card.count({ where: { memberId: owner.id } })).toBe(1);
      expect(await db.usageEvent.count({ where: { memberId: owner.id, type: 'card_listed' } })).toBe(0);
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" DROP CONSTRAINT "test_record_failure"');
      warn.mockRestore();
    }
  });

});
