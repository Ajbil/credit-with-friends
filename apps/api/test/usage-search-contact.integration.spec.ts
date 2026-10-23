import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { ServiceBus } from '../src/service-bus/service-bus.service';
import { UsageEventRecorder } from '../src/modules/usage/usage-event-recorder.service';
import { USAGE_EVENT_NAMES, type CardHolderContactedEvent, type CardSearchedEvent } from '../src/modules/usage/usage-events';
import type { PrismaService } from '../src/common/database/prisma.service';

const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_usage_search_contact_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
let db: PrismaClient;
let bus: ServiceBus;
let warn: ReturnType<typeof vi.fn>;

async function member(name: string) {
  return db.member.create({ data: {
    googleAccountId: randomUUID(), googleEmail: `${name}@example.in`, displayName: name,
    whatsappE164: '+919876543210', isAdultConfirmed: true,
  } });
}

async function circle(memberId: string) {
  return db.circle.create({ data: {
    name: 'Friends', isOwnerCreated: false, adminMemberId: memberId,
    inviteCode: randomUUID(),
  } });
}

describe('search and WhatsApp usage events', () => {
  beforeAll(async () => {
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
    });
    db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
    bus = new ServiceBus();
    warn = vi.fn();
    const logger = { info: vi.fn(), warn } as unknown as PinoLogger;
    new UsageEventRecorder(db as unknown as PrismaService, bus, logger).onModuleInit();
  }, 60_000);

  afterAll(async () => {
    if (db) await db.$disconnect();
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
  }, 60_000);

  test('done-when-5: search and WhatsApp tap retain counts and circles without a variant or phone number', async () => {
    const shopper = await member('shopper');
    const holder = await member('holder');
    const firstCircle = await circle(shopper.id);
    const secondCircle = await circle(shopper.id);
    const search: CardSearchedEvent = {
      id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: shopper.id,
      data: { circleIds: [firstCircle.id, secondCircle.id], bankId: 'hdfc-bank', cardType: 'credit', peopleFound: 3 },
    };
    Object.assign(search.data, { variant: 'Flip-Kart' });
    const contact: CardHolderContactedEvent = {
      id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: shopper.id,
      data: { holderMemberId: holder.id, circleIds: [firstCircle.id, secondCircle.id] },
    };
    await bus.publish(USAGE_EVENT_NAMES.search, search);
    await bus.publish(USAGE_EVENT_NAMES.whatsappTap, contact);
    for (const [id, type] of [[search.id, 'search'], [contact.id, 'whatsapp_tap']] as const) {
      await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { id } })).toBe(1));
      const row = await db.usageEvent.findUniqueOrThrow({ where: { id }, include: { circles: true } });
      expect(row.type).toBe(type);
      expect(row.memberId).toBe(shopper.id);
      expect(row.circles.map(({ circleId }) => circleId).sort()).toEqual([firstCircle.id, secondCircle.id].sort());
      expect(JSON.stringify(row)).not.toMatch(/flip-?kart|\+919876543210/i);
    }
    expect(await db.usageEvent.findUniqueOrThrow({ where: { id: search.id } })).toMatchObject({
      bankId: 'hdfc-bank', cardType: 'credit', peopleFound: 3, holderMemberId: null,
    });
    expect(await db.usageEvent.findUniqueOrThrow({ where: { id: contact.id } })).toMatchObject({
      holderMemberId: holder.id, bankId: null, cardType: null, peopleFound: null,
    });
    await bus.publish(USAGE_EVENT_NAMES.search, search);
    await bus.publish(USAGE_EVENT_NAMES.whatsappTap, contact);
    expect(await db.usageEvent.count({ where: { id: { in: [search.id, contact.id] } } })).toBe(2);
    await db.member.delete({ where: { id: holder.id } });
    expect((await db.usageEvent.findUniqueOrThrow({ where: { id: contact.id } })).holderMemberId).toBeNull();
  });

  test('done-when-5: events with no circles record and a failed write cannot escape the bus', async () => {
    const shopper = await member('alone');
    const search: CardSearchedEvent = {
      id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: shopper.id,
      data: { circleIds: [], bankId: 'axis-bank', cardType: 'either', peopleFound: 0 },
    };
    const contact: CardHolderContactedEvent = {
      id: randomUUID(), version: 1, timestampUtc: new Date(), initiatedByAccountId: shopper.id,
      data: { holderMemberId: shopper.id, circleIds: [] },
    };
    await bus.publish(USAGE_EVENT_NAMES.search, search);
    await bus.publish(USAGE_EVENT_NAMES.whatsappTap, contact);
    for (const id of [search.id, contact.id]) {
      await vi.waitFor(async () => expect(await db.usageEvent.count({ where: { id } })).toBe(1));
      expect((await db.usageEvent.findUniqueOrThrow({ where: { id }, include: { circles: true } })).circles).toEqual([]);
    }
    await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" ADD CONSTRAINT "test_usage_failure" CHECK (type NOT IN (\'search\', \'whatsapp_tap\')) NOT VALID');
    try {
      for (const [eventName, event] of [[USAGE_EVENT_NAMES.search, search], [USAGE_EVENT_NAMES.whatsappTap, contact]] as const) {
        await expect(bus.publish(eventName, { ...event, id: randomUUID() })).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ eventName, outcome: 'failed' }) }), 'Usage event recording failed');
      }
    } finally {
      await db.$executeRawUnsafe('ALTER TABLE "UsageEvent" DROP CONSTRAINT "test_usage_failure"');
    }
  });
});
