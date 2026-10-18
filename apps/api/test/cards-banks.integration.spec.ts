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

const origin = 'http://localhost:5173';
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_cards_banks_test_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
let app: Awaited<ReturnType<typeof start>>;
let db: PrismaClient;
let url: string;

async function start() {
  const [{ AppModule }, { configureApi }] = await Promise.all([import('../src/app.module'), import('../src/common/api/api.config')]);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const application = module.createNestApplication();
  configureApi(application, application.get(ConfigService<ApiConfig, true>));
  await application.listen(0, '127.0.0.1');
  return application;
}

async function call(path: string, cookie = '') {
  const response = await fetch(`${url}/api/v1${path}`, { headers: { cookie } });
  return { response, payload: await response.json() };
}

describe('cards bank list API', () => {
  beforeAll(async () => {
    for (const [name, value] of Object.entries({ API_ORIGIN: 'http://localhost:3000', WEB_ORIGIN: origin, DATABASE_URL: databaseUrl.toString(), OWNER_CONTACT_EMAIL: 'owner@example.in', SESSION_SECRET: 'integration-test-secret-with-enough-entropy', PRELAUNCH_ALLOWED_EMAILS: 'listed@example.in', LAUNCH_OPEN: 'false', TEST_AUTH_ENABLED: 'true', NODE_ENV: 'test' })) vi.stubEnv(name, value);
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString() } });
    app = await start();
    db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } } });
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    vi.unstubAllEnvs();
  }, 60_000);

  test('done-when-7: listed banks provide the contact address and display a corrected name', async () => {
    const signedIn = await fetch(`${url}/api/v1/test-auth/sign-in`, { method: 'POST', headers: { origin, 'x-requested-with': 'cwf', 'content-type': 'application/json' }, body: JSON.stringify({ googleAccountId: 'banks-member', email: 'listed@example.in', name: 'Banks member' }) });
    const cookie = signedIn.headers.get('set-cookie')?.split(';')[0] ?? '';
    const onboarded = await fetch(`${url}/api/v1/onboarding`, { method: 'POST', headers: { cookie, origin, 'x-requested-with': 'cwf', 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Banks member', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 }) });
    expect(onboarded.status).toBe(200);

    const all = await Promise.all([1, 2, 3].map((page) => call(`/banks?page=${page}`, cookie)));
    expect(all.map(({ response }) => response.status)).toEqual([200, 200, 200]);
    const banks = all.flatMap(({ payload }) => payload.data.items);
    expect(banks).toHaveLength(57);
    expect(new Set(banks.map(({ id }: { id: string }) => id)).size).toBe(57);
    expect(all[0].payload.data).toMatchObject({ contactEmail: 'owner@example.in', pagination: { page: 1, limit: 20, totalItems: 57, totalPages: 3 } });
    expect(banks.map(({ sortName }: { sortName: string }) => sortName)).toEqual([...banks.map(({ sortName }: { sortName: string }) => sortName)].sort((a, b) => a.localeCompare(b, 'en')));
    expect(banks.find(({ id }: { id: string }) => id === 'state-bank-of-india')).toMatchObject({ displayName: 'State Bank of India (SBI)', sortName: 'State Bank of India (SBI)' });
    expect(banks.find(({ id }: { id: string }) => id === 'cosmos-co-operative-bank')).toMatchObject({ displayName: 'The Cosmos Co-operative Bank', sortName: 'Cosmos Co-operative Bank' });

    await db.bank.update({ where: { id: 'hdfc-bank' }, data: { displayName: 'HDFC Bank corrected' } });
    const renamed = await call('/banks?limit=57', cookie);
    expect(renamed.payload.data.items.find(({ id }: { id: string }) => id === 'hdfc-bank').displayName).toBe('HDFC Bank corrected');
    expect((await call('/banks')).response.status).toBe(401);
    const invalid = await call('/banks?limit=101', cookie);
    expect(invalid.response.status).toBe(400);
    expect(invalid.payload.error.message).toBe('Input validation failed.');
    expect(invalid.payload.error.details.fieldErrors).toEqual([{ field: 'limit', reason: 'Use a whole number from 1 to 100.' }]);
  });
});
