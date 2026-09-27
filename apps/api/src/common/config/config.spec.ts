import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ApiConfig } from './config.module';

const validEnvironment = {
  API_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/credit_with_friends',
  OWNER_CONTACT_EMAIL: 'owner@example.in',
  SESSION_SECRET: 'local-test-secret',
  WEB_ORIGIN: 'http://localhost:5173',
};

let validateConfig: (env: Record<string, unknown>) => ApiConfig;

beforeAll(async () => {
  for (const [key, value] of Object.entries(validEnvironment)) vi.stubEnv(key, value);
  ({ validateConfig } = await import('./config.module'));
});

afterAll(() => vi.unstubAllEnvs());

describe('validateConfig', () => {
  it('config-rejects-missing-required-value', () => {
    expect(() => validateConfig({ ...validEnvironment, DATABASE_URL: '' })).toThrow('DATABASE_URL is required');
  });

  it('config-rejects-malformed-value', () => {
    for (const [name, value] of [
      ['API_ORIGIN', 'https://example.com/path'],
      ['DATABASE_URL', 'https://example.com/database'],
      ['OWNER_CONTACT_EMAIL', 'not-an-email'],
      ['PORT', '70000'],
      ['TRUST_PROXY', '-1'],
      ['TRUST_PROXY', '1.5'],
      ['TRUST_PROXY', 'invalid'],
    ]) {
      expect(() => validateConfig({ ...validEnvironment, [name]: value })).toThrow(name);
    }
  });

  it('config-allows-missing-owner-id', () => {
    const config = validateConfig(validEnvironment);
    expect(config.ownerGoogleAccountId).toBeUndefined();
    expect(config.trustProxy).toBe(0);
    expect(validateConfig({ ...validEnvironment, TRUST_PROXY: '1' }).trustProxy).toBe(1);
  });
});
