import type { AddressInfo } from 'node:net';
import { createHash, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { Issuer } from 'openid-client';
import { SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/common/database/prisma.service';
import type { ApiConfig } from '../src/common/config/config.module';

const origin = 'http://localhost:5173';
const identity = { googleAccountId: 'account-test-one', email: 'listed@example.in', name: 'Listed Person' };
const baseDatabaseUrl = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends';
const schemaName = `cwf_accounts_test_${randomUUID().replace(/-/g, '')}`;
const databaseUrl = new URL(baseDatabaseUrl);
databaseUrl.searchParams.set('schema', schemaName);
let app: Awaited<ReturnType<typeof start>>;
let db: PrismaService;
let url: string;
let googleServer: Server;
let googleUrl: string;
const googleCodes = new Map<string, { sub: string; email: string; name: string; nonce: string; challenge: string; badSignature?: boolean }>();
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: wrongPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function signedIdToken(code: string): string {
  const person = googleCodes.get(code)!;
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'google-test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'google-test-client', sub: person.sub, nonce: person.nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  const message = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(message).sign(person.badSignature ? wrongPrivateKey : privateKey).toString('base64url');
  return `${message}.${signature}`;
}

function startGoogleEdge(): Promise<void> {
  googleServer = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', googleUrl).pathname;
    response.setHeader('content-type', 'application/json');
    if (path === '/jwks') {
      response.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'google-test-key', use: 'sig', alg: 'RS256' }] }));
      return;
    }
    if (path === '/token') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = new URLSearchParams(Buffer.concat(chunks).toString());
      const code = body.get('code') ?? '';
      const person = googleCodes.get(code);
      const verifier = body.get('code_verifier') ?? '';
      if (!person || createHash('sha256').update(verifier).digest('base64url') !== person.challenge) {
        response.writeHead(400);
        response.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      response.end(JSON.stringify({ access_token: code, token_type: 'Bearer', expires_in: 600, id_token: signedIdToken(code) }));
      return;
    }
    if (path === '/userinfo') {
      const person = googleCodes.get(request.headers.authorization?.replace('Bearer ', '') ?? '');
      response.writeHead(person ? 200 : 401);
      response.end(person ? JSON.stringify({ sub: person.sub, email: person.email, name: person.name, email_verified: true }) : JSON.stringify({ error: 'invalid_token' }));
      return;
    }
    response.writeHead(404);
    response.end('{}');
  });
  return new Promise((resolve) => googleServer.listen(0, '127.0.0.1', () => {
    googleUrl = `http://127.0.0.1:${(googleServer.address() as AddressInfo).port}`;
    resolve();
  }));
}

async function googleStart(returnPath: string) {
  const response = await fetch(`${url}/api/v1/auth/google/start?returnTo=${encodeURIComponent(returnPath)}`, { redirect: 'manual' });
  const authorization = new URL(response.headers.get('location')!);
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { response, authorization, cookie };
}

async function googleCallback(start: Awaited<ReturnType<typeof googleStart>>, person: { sub: string; email: string; name: string }, badSignature = false) {
  const code = randomUUID();
  googleCodes.set(code, { ...person, nonce: start.authorization.searchParams.get('nonce')!, challenge: start.authorization.searchParams.get('code_challenge')!, badSignature });
  return fetch(`${url}/api/v1/auth/google/callback?state=${encodeURIComponent(start.authorization.searchParams.get('state')!)}&code=${code}`, { headers: { cookie: start.cookie }, redirect: 'manual' });
}

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
  const response = await fetch(`${url}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  return { response, payload: await response.json() };
}

async function signIn(person = identity) {
  const { response, payload } = await call('/test-auth/sign-in', 'POST', '', person);
  return { response, payload, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

describe('sign-in and onboarding API', () => {
  beforeAll(async () => {
    vi.stubEnv('API_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('WEB_ORIGIN', origin);
    vi.stubEnv('DATABASE_URL', databaseUrl.toString());
    vi.stubEnv('OWNER_CONTACT_EMAIL', 'owner@example.in');
    vi.stubEnv('SESSION_SECRET', 'integration-test-secret-with-enough-entropy');
    vi.stubEnv('PRELAUNCH_ALLOWED_EMAILS', 'listed@example.in');
    vi.stubEnv('LAUNCH_OPEN', 'false');
    vi.stubEnv('TEST_AUTH_ENABLED', 'true');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-test-client');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'google-test-secret');
    vi.stubEnv('NODE_ENV', 'test');
    await startGoogleEdge();
    vi.spyOn(Issuer, 'discover').mockImplementation(async () => new Issuer({
      issuer: 'https://accounts.google.com', authorization_endpoint: `${googleUrl}/authorize`, token_endpoint: `${googleUrl}/token`,
      jwks_uri: `${googleUrl}/jwks`, userinfo_endpoint: `${googleUrl}/userinfo`, id_token_signing_alg_values_supported: ['RS256'],
    }));
    execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
    });
    app = await start();
    db = app.get(PrismaService);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (app) await app.close();
    if (googleServer) await new Promise<void>((resolve, reject) => googleServer.close((error) => error ? reject(error) : resolve()));
    vi.restoreAllMocks();
    const admin = new PrismaClient({ datasources: { db: { url: baseDatabaseUrl } } });
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
    vi.unstubAllEnvs();
  });

  test('done-when-1: onboarding creates one member and pending sign-ins cannot use member data', async () => {
    const { cookie } = await signIn();
    expect((await call('/members/me', 'GET', cookie)).response.status).toBe(403);
    const valid = { displayName: '  Listed Person  ', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 };
    for (const [field, change] of [
      ['displayName', { displayName: ' ' }],
      ['displayName', { displayName: 'x'.repeat(51) }],
      ['whatsappNumber', { whatsappNumber: '12' }],
      ['isAdultConfirmed', { isAdultConfirmed: false }],
      ['isConsentGiven', { isConsentGiven: false }],
      ['privacyNoticeVersion', { privacyNoticeVersion: 99 }],
    ] as const) {
      const invalid = await call('/onboarding', 'POST', cookie, { ...valid, ...change });
      expect(invalid.response.status).toBe(400);
      expect(invalid.payload.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
    }
    expect(await db.member.count({ where: { googleAccountId: identity.googleAccountId } })).toBe(0);

    const submit = () => call('/onboarding', 'POST', cookie, valid);
    const results = await Promise.all([submit(), submit()]);
    expect(results.map(({ response }) => response.status).sort()).toEqual([200, 200]);
    expect(await db.member.count({ where: { googleAccountId: identity.googleAccountId } })).toBe(1);
    const consents = await db.consent.findMany({ where: { member: { googleAccountId: identity.googleAccountId } }, include: { privacyNoticeVersion: true } });
    expect(consents).toHaveLength(1);
    // Version 1 is now published by migration; onboarding accepts that exact persisted notice.
    expect(consents[0]).toMatchObject({ acceptedAtUtc: expect.any(Date), privacyNoticeVersion: { version: 1, text: expect.stringContaining('owner@example.in') } });
    const profile = await call('/members/me', 'GET', cookie);
    expect(profile.payload.data).toMatchObject({ displayName: 'Listed Person', whatsappE164: '+919876543210' });
    const changedEmail = await signIn({ ...identity, email: 'changed@example.in' });
    expect(changedEmail.payload.data.status).toBe('member');
    expect((await call('/members/me', 'GET', changedEmail.cookie)).payload.data.id).toBe(profile.payload.data.id);
    expect((await call('/members/me', 'GET', changedEmail.cookie)).payload.data.googleEmail).toBe('changed@example.in');

    const second = await signIn({ googleAccountId: 'account-test-two', email: identity.email, name: 'Second Person', returnPath: '/circles/join/example' });
    expect((await call('/sign-ins', 'GET', second.cookie)).payload.data.returnPath).toBe('/circles/join/example');
    const nonIndian = await call('/onboarding', 'POST', second.cookie, { displayName: 'A', whatsappNumber: '+447911123456', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 });
    expect(nonIndian.response.status).toBe(200);
    expect(nonIndian.payload.data.whatsappE164).toBe('+447911123456');
  });

  test('Google start and callback verify the ID token, refuse outsiders, and retain the return path', async () => {
    const invalidState = await googleStart('/circles/join/google');
    expect(invalidState.response.status).toBe(302);
    expect(invalidState.cookie).toMatch(/^cwf_oauth=/);
    expect(invalidState.response.headers.get('set-cookie')).toMatch(/HttpOnly.*SameSite=Lax/i);
    expect(invalidState.authorization.searchParams.get('code_challenge_method')).toBe('S256');
    const tampered = await fetch(`${url}/api/v1/auth/google/callback?state=wrong&code=unused`, { headers: { cookie: invalidState.cookie }, redirect: 'manual' });
    expect(tampered.status).toBe(401);

    const invalidToken = await googleStart('/circles/join/google');
    const bad = await googleCallback(invalidToken, { sub: 'google-bad-token', email: identity.email, name: 'Bad Token' }, true);
    expect(bad.status).toBe(401);
    expect(await db.pendingSignIn.count({ where: { googleAccountId: 'google-bad-token' } })).toBe(0);

    const listed = await googleStart('/circles/join/google');
    const accepted = await googleCallback(listed, { sub: 'google-listed', email: identity.email, name: 'Google Listed' });
    expect(accepted.status).toBe(302);
    expect(accepted.headers.get('location')).toBe(`${origin}/onboarding?returnTo=%2Fcircles%2Fjoin%2Fgoogle`);
    const sessionCookie = accepted.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(sessionCookie).toMatch(/^cwf_session=/);
    expect((await call('/sign-ins', 'GET', sessionCookie)).payload.data.returnPath).toBe('/circles/join/google');
    expect((await call('/onboarding', 'POST', sessionCookie, { displayName: 'Google Listed', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
    const member = await call('/members/me', 'GET', sessionCookie);
    expect(member.payload.data.googleAccountId).toBe('google-listed');

    const returning = await googleStart('/circles/join/returning');
    const returned = await googleCallback(returning, { sub: 'google-listed', email: 'new-email@example.in', name: 'Google Listed' });
    expect(returned.status).toBe(302);
    expect(returned.headers.get('location')).toBe(`${origin}/circles/join/returning`);
    const returningCookie = returned.headers.get('set-cookie')?.split(';')[0] ?? '';
    const returnedMember = await call('/members/me', 'GET', returningCookie);
    expect(returnedMember.payload.data).toMatchObject({ id: member.payload.data.id, googleAccountId: 'google-listed', googleEmail: 'new-email@example.in' });
    expect(await db.member.count({ where: { googleAccountId: 'google-listed' } })).toBe(1);

    const outsider = await googleStart('/circles/join/outsider');
    const refused = await googleCallback(outsider, { sub: 'google-outsider', email: 'outside@example.in', name: 'Outsider' });
    expect(refused.status).toBe(302);
    expect(refused.headers.get('location')).toBe(`${origin}/not-open-yet`);
    expect(refused.headers.get('set-cookie')).not.toMatch(/cwf_session=/);
    expect(await db.pendingSignIn.count({ where: { googleAccountId: 'google-outsider' } })).toBe(0);
    expect(await db.member.count({ where: { googleAccountId: 'google-outsider' } })).toBe(0);
  });

  test('API description names the cookie scheme used by protected routes', async () => {
    const response = await fetch(`${url}/api/docs-json`);
    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document.components.securitySchemes.cwf_session).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'cwf_session' });
    expect(document.paths['/api/v1/onboarding'].post.security).toEqual([{ cwf_session: [] }]);
  });

  test('done-when-2: prelaunch denial stores nothing; cancel and inactivity erase pending sign-ins', async () => {
    const rejected = await signIn({ googleAccountId: 'not-listed', email: 'stranger@example.in', name: 'Stranger' });
    expect(rejected.response.status).toBe(403);
    expect(rejected.payload.error.message).toBe('Not open yet');
    expect(await db.pendingSignIn.count({ where: { googleAccountId: 'not-listed' } })).toBe(0);
    expect(await db.member.count({ where: { googleAccountId: 'not-listed' } })).toBe(0);

    const person = { googleAccountId: 'pending-cancel', email: identity.email, name: 'Pending' };
    const pending = await signIn(person);
    expect(pending.payload.data.status).toBe('pending');
    expect((await call('/sign-ins/cancel', 'POST', pending.cookie)).response.status).toBe(200);
    expect(await db.pendingSignIn.count({ where: { googleAccountId: person.googleAccountId } })).toBe(0);
    expect((await call('/onboarding', 'POST', pending.cookie, {})).response.status).toBe(401);

    const stale = await signIn({ ...person, googleAccountId: 'pending-stale' });
    const recent = await signIn({ ...person, googleAccountId: 'pending-recent' });
    await db.pendingSignIn.update({ where: { googleAccountId: 'pending-stale' }, data: { lastActivityAtUtc: new Date(Date.now() - 31 * 86_400_000) } });
    await db.pendingSignIn.update({ where: { googleAccountId: 'pending-recent' }, data: { lastActivityAtUtc: new Date(Date.now() - 29 * 86_400_000) } });
    const jobs = [...app.get(SchedulerRegistry).getCronJobs().values()];
    const cleanupJob = jobs.find((job) => job.cronTime.source === '0 0 3 * * *' && job.cronTime.timeZone === 'Asia/Kolkata');
    expect(cleanupJob).toBeDefined();
    await cleanupJob!.fireOnTick();
    expect(await db.pendingSignIn.count({ where: { googleAccountId: 'pending-stale' } })).toBe(0);
    expect(await db.pendingSignIn.count({ where: { googleAccountId: 'pending-recent' } })).toBe(1);
    expect((await call('/sign-ins', 'GET', stale.cookie)).response.status).toBe(401);
    expect((await call('/sign-ins', 'GET', recent.cookie)).response.status).toBe(200);
  });

  test('sessions renew the active browser cookie, expire independently, and retain member data', async () => {
    const person = { googleAccountId: 'account-test-sessions', email: identity.email, name: 'Device Person' };
    const pending = await signIn(person);
    expect((await call('/onboarding', 'POST', pending.cookie, { displayName: 'Device Person', whatsappNumber: '9876543210', isAdultConfirmed: true, isConsentGiven: true, privacyNoticeVersion: 1 })).response.status).toBe(200);
    const deviceTwo = await signIn(person);
    const signedOut = await call('/sessions/sign-out', 'POST', pending.cookie);
    expect(signedOut.response.status).toBe(201);
    expect(signedOut.response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await call('/members/me', 'GET', pending.cookie)).response.status).toBe(401);
    expect((await call('/members/me', 'GET', deviceTwo.cookie)).response.status).toBe(200);
    const tokenHash = createHash('sha256').update(deviceTwo.cookie.split('=')[1]).digest('hex');
    await db.session.update({ where: { tokenHash }, data: { expiresAtUtc: new Date(Date.now() + 86_400_000) } });
    const active = await call('/members/me', 'GET', deviceTwo.cookie);
    expect(active.response.status).toBe(200);
    expect(active.response.headers.get('set-cookie')).toContain(`${deviceTwo.cookie};`);
    expect(active.response.headers.get('set-cookie')).toContain('Max-Age=2592000');
    expect((await db.session.findUniqueOrThrow({ where: { tokenHash } })).expiresAtUtc.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    await db.session.update({ where: { tokenHash }, data: { expiresAtUtc: new Date(Date.now() - 1) } });
    expect((await call('/members/me', 'GET', deviceTwo.cookie)).response.status).toBe(401);
    const restored = await signIn(person);
    expect((await call('/members/me', 'GET', restored.cookie)).payload.data.displayName).toBe('Device Person');
  });

  test('production does not register the test sign-in route', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const [{ AppModule: ProductionAppModule }, { Test: ProductionTest }, { ConfigService: ProductionConfigService }, { configureApi: configureProductionApi }, { PrismaService: ProductionPrismaService }] = await Promise.all([
      import('../src/app.module'), import('@nestjs/testing'), import('@nestjs/config'), import('../src/common/api/api.config'), import('../src/common/database/prisma.service'),
    ]);
    const module = await ProductionTest.createTestingModule({ imports: [ProductionAppModule] }).compile();
    const productionApp = module.createNestApplication();
    try {
      configureProductionApi(productionApp, productionApp.get(ProductionConfigService<ApiConfig, true>));
      await productionApp.listen(0, '127.0.0.1');
      const productionUrl = `http://127.0.0.1:${(productionApp.getHttpServer().address() as AddressInfo).port}`;
      const response = await fetch(`${productionUrl}/api/v1/test-auth/sign-in`, {
        method: 'POST', headers: { origin, 'x-requested-with': 'cwf', 'content-type': 'application/json' },
        body: JSON.stringify({ googleAccountId: 'production-spoof', email: identity.email, name: 'Spoof' }),
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    } finally {
      await productionApp.get(ProductionPrismaService).$disconnect();
      await productionApp.close();
      vi.stubEnv('NODE_ENV', 'test');
    }
  });
});
