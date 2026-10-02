import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { ApiConfig } from '../src/common/config/config.module';

const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_public_privacy_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
let app: Awaited<ReturnType<Awaited<ReturnType<typeof Test.createTestingModule>>['createNestApplication']>>;
let url: string;

beforeAll(async () => {
  for (const [key, value] of Object.entries({
    API_ORIGIN: 'http://localhost:3000', WEB_ORIGIN: 'http://localhost:5173', DATABASE_URL: databaseUrl.toString(),
    OWNER_CONTACT_EMAIL: 'owner@example.in', SESSION_SECRET: 'integration-test-secret-with-enough-entropy',
    PRELAUNCH_ALLOWED_EMAILS: '', LAUNCH_OPEN: 'false', TEST_AUTH_ENABLED: 'false', NODE_ENV: 'test',
  })) vi.stubEnv(key, value);
  execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
  });
  const [{ AppModule }, { configureApi }] = await Promise.all([import('../src/app.module'), import('../src/common/api/api.config')]);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  configureApi(app, app.get(ConfigService<ApiConfig, true>));
  await app.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  if (app) await app.close();
  const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await admin.$disconnect();
  vi.unstubAllEnvs();
});

test('anyone can read the current privacy notice and contact address without a session', async () => {
  const response = await fetch(`${url}/api/v1/privacy-notice`);
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.data.version).toBe(1);
  expect(payload.data.text).toContain('any backup copy we make by hand is kept for at least 7 days');
  expect(payload.data.text).toContain('contact us at owner@example.in');
  expect(payload.data.text).not.toContain('{{OWNER_CONTACT_EMAIL}}');
});
