import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';
import { ServiceBus } from '../src/service-bus/service-bus.service';
import { USAGE_EVENT_NAMES } from '../src/modules/usage/usage-events';

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_contact_${randomUUID().replace(/-/g, '')}`;
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

async function member(name: string, number = '9876543210') {
  const signedIn = await call('/test-auth/sign-in', 'POST', '', { googleAccountId: randomUUID(), email: 'listed@example.in', name });
  expect(signedIn.response.status).toBe(201);
  const cookie = signedIn.response.headers.get('set-cookie')?.split(';')[0] ?? '';
  expect((await call('/onboarding', 'POST', cookie, { displayName: name, whatsappNumber: number, isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
  return { cookie, id: (await call('/members/me', 'GET', cookie)).payload.data.id as string };
}

async function circle(name: string, creator: Awaited<ReturnType<typeof member>>, ...others: Array<Awaited<ReturnType<typeof member>>>) {
  const created = await call('/circles', 'POST', creator.cookie, { name });
  expect(created.response.status).toBe(201);
  const id = created.payload.data.id as string;
  const invite = await call(`/circles/${id}/invite`, 'GET', creator.cookie);
  const code = (invite.payload.data.url as string).split('/').at(-1)!;
  for (const other of others) expect((await call(`/circle-invites/${code}/join`, 'POST', other.cookie)).response.status).toBe(200);
  return id;
}

async function add(cookie: string, variant?: string, bankId = 'hdfc-bank', type = 'credit') {
  const added = await call('/me/cards', 'POST', cookie, { bankId, type, ...(variant !== undefined && { variant }) });
  expect(added.response.status, JSON.stringify(added.payload)).toBe(201);
  return added.payload.data.id as string;
}

function contact(cookie: string, cardId: string, requestedWith = true) {
  return call('/contacts', 'POST', cookie, { cardId }, requestedWith);
}

function expectUnavailable(result: Awaited<ReturnType<typeof contact>>) {
  expect(result.response.status).toBe(404);
  expect(result.payload).toMatchObject({ success: false, data: null, error: { code: 'CARD_UNAVAILABLE', message: 'This card is no longer available.' } });
}

async function waitForBlocked(label: string, blockers: number[], excluded: number[] = [], sql?: string) {
  let found = 0;
  await vi.waitFor(async () => {
    const waiting = await db.$queryRaw<Array<{ pid: number; query: string; blockers: number[] }>>`
      SELECT pid, query, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
      WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
    const row = waiting.find(({ pid, query, blockers: blockedBy }) =>
      !excluded.includes(pid) && blockedBy.some((pid) => blockers.includes(pid)) && (!sql || query.includes(sql)));
    expect(row, `${label} never waited: ${JSON.stringify(waiting)}`).toBeDefined();
    found = row!.pid;
  }, { timeout: 8_000 });
  return found;
}

type Member = Awaited<ReturnType<typeof member>>;
function endTie(change: 'holder leave' | 'holder removal' | 'searcher leave' | 'searcher removal' | 'circle deletion' | 'card removal', circleId: string, cardId: string, shopper: Member, holder: Member) {
  switch (change) {
    case 'holder leave': return () => call(`/circles/${circleId}/leave`, 'POST', holder.cookie);
    case 'holder removal': return () => call(`/circles/${circleId}/members/${holder.id}/remove`, 'POST', shopper.cookie);
    case 'searcher leave': return () => call(`/circles/${circleId}/leave`, 'POST', shopper.cookie);
    case 'searcher removal': return () => call(`/circles/${circleId}/members/${shopper.id}/remove`, 'POST', holder.cookie);
    case 'circle deletion': return () => call(`/circles/${circleId}`, 'DELETE', shopper.cookie);
    case 'card removal': return () => call(`/me/cards/${cardId}`, 'DELETE', holder.cookie);
  }
}

const changes = ['card removal', 'holder leave', 'holder removal', 'searcher leave', 'searcher removal', 'circle deletion'] as const;

describe('contact API', () => {
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

  test('done-when-3: a contact press returns the current bank and holder details in an editable WhatsApp link', async () => {
    const shopper = await member('Shopper');
    const holder = await member('Meera Shah', '+447911123456');
    await circle('Friends', shopper, holder);
    const withVariant = await add(holder.cookie, 'Regalia Gold');
    const withoutVariant = await add(holder.cookie, undefined, 'hdfc-bank', 'debit');
    await db.bank.update({ where: { id: 'hdfc-bank' }, data: { displayName: 'HDFC Bank revised' } });
    try {
      for (const [cardId, message] of [
        [withVariant, 'Hi Meera Shah, I saw on CreditWithFriends (creditwithfriends.in) that you have an HDFC Bank revised credit card, Regalia Gold. Do you have a moment? I need it for an offer.'],
        [withoutVariant, 'Hi Meera Shah, I saw on CreditWithFriends (creditwithfriends.in) that you have an HDFC Bank revised debit card. Do you have a moment? I need it for an offer.'],
      ]) {
        const result = await contact(shopper.cookie, cardId);
        expect(result.response.status, JSON.stringify(result.payload)).toBe(201);
        expect(result.payload).toEqual({ success: true, data: { whatsappUrl: `https://wa.me/447911123456?text=${encodeURIComponent(message)}` }, error: null });
      }
    } finally { await db.bank.update({ where: { id: 'hdfc-bank' }, data: { displayName: 'HDFC Bank' } }); }
  });

  test('done-when-4: unavailable cards and broken circle ties refuse the press without recording it', async () => {
    const shopper = await member('Refusal shopper');
    const holder = await member('Refusal holder');
    const outsider = await member('Outsider');
    const first = await circle('First', shopper, holder);
    const second = await circle('Second', shopper, holder);
    const cardId = await add(holder.cookie);
    const ownCardId = await add(shopper.cookie);
    const outsiderCardId = await add(outsider.cookie);
    const before = await db.usageEvent.count({ where: { type: 'whatsapp_tap', memberId: shopper.id } });
    for (const id of [randomUUID(), ownCardId, outsiderCardId]) expectUnavailable(await contact(shopper.cookie, id));
    expect((await call(`/circles/${first}/members/${holder.id}/remove`, 'POST', shopper.cookie)).response.status).toBe(200);
    expect((await contact(shopper.cookie, cardId)).response.status).toBe(201);
    expect((await call(`/circles/${second}`, 'DELETE', shopper.cookie)).response.status).toBe(200);
    expectUnavailable(await contact(shopper.cookie, cardId));
    const removed = await add(holder.cookie, 'Millennia');
    expect((await call(`/me/cards/${removed}`, 'DELETE', holder.cookie)).response.status).toBe(200);
    expectUnavailable(await contact(shopper.cookie, removed));
    expect((await contact(shopper.cookie, 'bad')).response.status).toBe(400);
    await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { type: 'whatsapp_tap', memberId: shopper.id } })).toBe(before + 1));
  });

  test('done-when-3 and 4: a contact needs a session and the POST request header', async () => {
    const shopper = await member('Protected shopper');
    const holder = await member('Protected holder');
    await circle('Protected', shopper, holder);
    const id = await add(holder.cookie);
    expect((await contact('', id)).response.status).toBe(401);
    expect((await contact(shopper.cookie, id, false)).response.status).toBe(403);
  });

  test('done-when-3: the WhatsApp link returns while counting is held and still returns when counting fails', async () => {
    const shopper = await member('Fast shopper');
    const holder = await member('Fast holder');
    await circle('Fast', shopper, holder);
    const id = await add(holder.cookie);
    const bus = app.get(ServiceBus);
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let observed = 0;
    bus.registerEvent(USAGE_EVENT_NAMES.whatsappTap, async () => { observed++; await held; });
    try {
      const first = await contact(shopper.cookie, id);
      expect(first.response.status).toBe(201);
      expect(first.payload.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
      expect(observed).toBe(1);
      release();
      bus.registerEvent(USAGE_EVENT_NAMES.whatsappTap, async () => { throw new Error('forced recorder failure'); });
      const second = await contact(shopper.cookie, id);
      expect(second.response.status).toBe(201);
      expect(second.payload.data.whatsappUrl).toBe(first.payload.data.whatsappUrl);
    } finally { release(); }
  });

  test('done-when-4: the holder number appears only inside the returned WhatsApp link', async () => {
    const shopper = await member('Log shopper');
    const holder = await member('Log holder', '+447911123456');
    await circle('Log circle', shopper, holder);
    const id = await add(holder.cookie);
    const root = PinoLogger.root as unknown as Record<symbol, { write: (chunk: string) => boolean }>;
    const symbol = Object.getOwnPropertySymbols(root).find((candidate) => candidate.toString() === 'Symbol(pino.stream)');
    expect(symbol).toBeDefined();
    const destination = root[symbol!];
    const lines: string[] = [];
    const write = destination.write.bind(destination);
    const capture = vi.spyOn(destination, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return write(chunk); });
    try {
      const result = await contact(shopper.cookie, id);
      expect(result.response.status).toBe(201);
      expect(result.payload.data.whatsappUrl).toContain('wa.me/447911123456?');
      expect(JSON.stringify(result.payload).replace(result.payload.data.whatsappUrl, '')).not.toMatch(/447911123456|\+447911123456/);
      expect(lines.join('')).not.toMatch(/447911123456|\+447911123456/);
    } finally { capture.mockRestore(); }
  });

  test.each(changes)('done-when-4: %s racing a contact press preserves the committed ordering', async (change) => {
    const shopper = await member(`Change first shopper ${change}`);
    const holder = await member(`Change first holder ${change}`);
    const circleId = change === 'searcher removal'
      ? await circle(`Change first ${change}`, holder, shopper)
      : await circle(`Change first ${change}`, shopper, holder);
    const cardId = await add(holder.cookie);
    const lockUrl = new URL(databaseUrl);
    lockUrl.searchParams.set('application_name', `${schemaName}_${change.replaceAll(' ', '_')}_blocker`);
    const lockDb = new PrismaClient({ datasources: { db: { url: lockUrl.toString() } } });
    let release!: () => void;
    let ready!: (pid: number) => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<number>((resolve) => { ready = resolve; });
    const blocker = lockDb.$transaction(async (tx) => {
      const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      if (change === 'card removal') await tx.$queryRaw`SELECT "id" FROM "Card" WHERE "id" = ${cardId}::uuid FOR UPDATE`;
      else await tx.$queryRaw`SELECT "id" FROM "Circle" WHERE "id" = ${circleId}::uuid FOR UPDATE`;
      ready(pid);
      await released;
    }, { timeout: 30_000 });
    let press: ReturnType<typeof contact> | undefined;
    let changeRequest: ReturnType<ReturnType<typeof endTie>> | undefined;
    let waitError: unknown;
    const completed: string[] = [];
    try {
      const blockerPid = await locked;
      press = contact(shopper.cookie, cardId);
      void press.then(() => { completed.push('press'); });
      const pressPid = await waitForBlocked('contact press', [blockerPid], [], 'FOR SHARE');
      changeRequest = endTie(change, circleId, cardId, shopper, holder)();
      void changeRequest.then(() => { completed.push('change'); });
      const changePid = await waitForBlocked(`${change} change`, [blockerPid, pressPid], [pressPid], change === 'card removal' ? 'DELETE' : 'FOR UPDATE');
      const waiting = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
        SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
      for (const pid of [pressPid, changePid]) expect(waiting.find((row) => row.pid === pid && row.blockers.length > 0), `connection ${pid} stopped waiting`).toBeDefined();
    } catch (error) { waitError = error; }
    finally { release(); try { await blocker; } finally { await lockDb.$disconnect(); } }
    const [answer, changed] = await Promise.all([press, changeRequest]);
    if (waitError) throw waitError;
    expect(changed!.response.status).toBe(200);
    if (answer!.response.status === 201) {
      expect(answer!.payload.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\//);
      expect(completed).toEqual(['press', 'change']);
    }
    else expectUnavailable(answer!);
    expectUnavailable(await contact(shopper.cookie, cardId));
  });

  test.each(changes)('done-when-4: contact-first %s waits until the link is returned', async (change) => {
    const shopper = await member(`Press first shopper ${change}`);
    const holder = await member(`Press first holder ${change}`);
    const circleId = change === 'searcher removal'
      ? await circle(`Press first ${change}`, holder, shopper)
      : await circle(`Press first ${change}`, shopper, holder);
    const cardId = await add(holder.cookie);
    const bus = app.get(ServiceBus);
    const original = bus.request.bind(bus);
    let release!: () => void;
    let ready!: (pid: number) => void;
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const waiting = new Promise<number>((resolve) => { ready = resolve; });
    const spy = vi.spyOn(bus, 'request').mockImplementation(async (name: string, input: unknown) => {
      const answer = await original(name, input);
      if (name === 'cards.lockCard') {
        const tx = (input as { tx: PrismaService }).tx;
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        ready(pid);
        await paused;
      }
      return answer;
    });
    let press: ReturnType<typeof contact> | undefined;
    let changeRequest: ReturnType<ReturnType<typeof endTie>> | undefined;
    try {
      press = contact(shopper.cookie, cardId);
      const pressPid = await waiting;
      changeRequest = endTie(change, circleId, cardId, shopper, holder)();
      const changePid = await waitForBlocked(`${change} change`, [pressPid], [], change === 'card removal' ? 'DELETE' : 'FOR UPDATE');
      const blocked = await db.$queryRaw<Array<{ pid: number; blockers: number[] }>>`
        SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
        WHERE application_name = ${`${schemaName}_api`} AND wait_event_type = 'Lock'`;
      expect(blocked.find(({ pid, blockers }) => pid === changePid && blockers.includes(pressPid))).toBeDefined();
      release();
      const answer = await press;
      expect(answer.response.status, JSON.stringify(answer.payload)).toBe(201);
      expect(answer.payload.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\//);
      expect((await changeRequest).response.status).toBe(200);
      expectUnavailable(await contact(shopper.cookie, cardId));
    } finally {
      release();
      await Promise.allSettled([press, changeRequest].filter((promise) => promise !== undefined));
      spy.mockRestore();
    }
  });
});
