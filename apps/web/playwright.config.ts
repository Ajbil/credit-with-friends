import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

const schema = process.env.CWF_WEB_TEST_SCHEMA ?? `cwf_web_test_${randomUUID().replace(/-/g, '')}`;
process.env.CWF_WEB_TEST_SCHEMA = schema;
const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends');
databaseUrl.searchParams.set('schema', schema);
process.env.CWF_WEB_TEST_DATABASE_URL = databaseUrl.toString();

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/teardown.ts',
  fullyParallel: true,
  retries: 0,
  use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL: 'http://localhost:5173' },
  webServer: [
    { command: 'pnpm --filter @symphony/api db:migrate:deploy && pnpm --filter @symphony/api dev', cwd: '../..', url: 'http://localhost:3104/api/v1/health', reuseExistingServer: false, timeout: 120_000,
      env: { DATABASE_URL: databaseUrl.toString(), API_ORIGIN: 'http://localhost:3104', WEB_ORIGIN: 'http://localhost:5173', PORT: '3104', OWNER_CONTACT_EMAIL: 'owner@example.in', SESSION_SECRET: 'web-test-session-secret-at-least-32-characters', PRELAUNCH_ALLOWED_EMAILS: 'listed@example.in', TEST_AUTH_ENABLED: 'true', NODE_ENV: 'test' } },
    { command: 'pnpm --filter @symphony/web dev', cwd: '../..', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 120_000, env: { VITE_API_ORIGIN: 'http://localhost:3104' } },
  ],
});
