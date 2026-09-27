import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

export interface ApiConfig {
  apiOrigin: string;
  databaseUrl: string;
  environment: 'Local' | 'Production';
  googleClientId?: string;
  googleClientSecret?: string;
  launchOpen: boolean;
  ownerContactEmail: string;
  ownerGoogleAccountId?: string;
  port: number;
  prelaunchAllowedEmails: string[];
  sessionSecret: string;
  testAuthEnabled: boolean;
  trustProxy: number;
  webOrigin: string;
}

function required(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function origin(env: Record<string, unknown>, name: string): string {
  const value = required(env, name);
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) {
      throw new Error();
    }
    return parsed.origin;
  } catch {
    throw new Error(`${name} must be an HTTP or HTTPS origin`);
  }
}

function boolean(env: Record<string, unknown>, name: string, fallback: boolean): boolean {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function databaseUrl(env: Record<string, unknown>): string {
  const value = required(env, 'DATABASE_URL');
  try {
    const parsed = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) throw new Error();
    return value;
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
}

export function validateConfig(env: Record<string, unknown>): ApiConfig {
  const rawPort = env.PORT ?? '3000';
  const port = typeof rawPort === 'string' && /^\d+$/.test(rawPort) ? Number(rawPort) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  const rawTrustProxy = env.TRUST_PROXY ?? '0';
  const trustProxy = typeof rawTrustProxy === 'string' && /^\d+$/.test(rawTrustProxy) ? Number(rawTrustProxy) : NaN;
  if (!Number.isSafeInteger(trustProxy) || trustProxy < 0) throw new Error('TRUST_PROXY must be a non-negative integer');

  const ownerContactEmail = required(env, 'OWNER_CONTACT_EMAIL');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerContactEmail)) {
    throw new Error('OWNER_CONTACT_EMAIL must be a valid email address');
  }
  const allowlist = env.PRELAUNCH_ALLOWED_EMAILS;
  if (allowlist !== undefined && allowlist !== '' && (typeof allowlist !== 'string' || allowlist.split(',').some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))) {
    throw new Error('PRELAUNCH_ALLOWED_EMAILS must be comma-separated email addresses');
  }

  return {
    apiOrigin: origin(env, 'API_ORIGIN'),
    databaseUrl: databaseUrl(env),
    environment: env.NODE_ENV === 'production' ? 'Production' : 'Local',
    googleClientId: typeof env.GOOGLE_CLIENT_ID === 'string' ? env.GOOGLE_CLIENT_ID : undefined,
    googleClientSecret: typeof env.GOOGLE_CLIENT_SECRET === 'string' ? env.GOOGLE_CLIENT_SECRET : undefined,
    launchOpen: boolean(env, 'LAUNCH_OPEN', false),
    ownerContactEmail,
    ownerGoogleAccountId: typeof env.OWNER_GOOGLE_ACCOUNT_ID === 'string' ? env.OWNER_GOOGLE_ACCOUNT_ID : undefined,
    port,
    prelaunchAllowedEmails: typeof allowlist === 'string' && allowlist !== '' ? allowlist.split(',').map((email) => email.trim().toLowerCase()) : [],
    sessionSecret: required(env, 'SESSION_SECRET'),
    testAuthEnabled: boolean(env, 'TEST_AUTH_ENABLED', false),
    trustProxy,
    webOrigin: origin(env, 'WEB_ORIGIN'),
  };
}

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateConfig })], exports: [ConfigModule] })
export class ApiConfigModule {}
