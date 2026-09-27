import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { All, Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { IsEmail } from 'class-validator';
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { configureApi } from '../src/common/api/api.config';
import type { ApiConfig } from '../src/common/config/config.module';
import { PrismaService } from '../src/common/database/prisma.service';

const WEB_ORIGIN = 'http://localhost:5173';
const VALID_BODY = { email: 'member@example.in' };
const TEST_ENV = {
  API_ORIGIN: 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/credit_with_friends',
  LAUNCH_OPEN: 'false',
  OWNER_CONTACT_EMAIL: 'owner@example.in',
  PORT: '3000',
  PRELAUNCH_ALLOWED_EMAILS: '',
  SESSION_SECRET: 'integration-test-secret-with-enough-entropy',
  TEST_AUTH_ENABLED: 'false',
  WEB_ORIGIN,
};

class ProbeRequestDto {
  @IsEmail()
  email!: string;
}

@Controller('test-probe')
@ApiExcludeController()
class ProbeController {
  @Post('validate')
  validate(@Body() body: ProbeRequestDto): ProbeRequestDto {
    return body;
  }

  @All('mutation')
  mutate(@Body() body: ProbeRequestDto): ProbeRequestDto {
    return body;
  }

  @Get('rate-limit')
  rateLimit(): { status: string } {
    return { status: 'ok' };
  }
}

Reflect.defineMetadata('design:paramtypes', [ProbeRequestDto], ProbeController.prototype, 'validate');

let app: Awaited<ReturnType<typeof createApplication>>;
let baseUrl = '';

function configureEnvironment(nodeEnv = 'test'): void {
  for (const [key, value] of Object.entries(TEST_ENV)) vi.stubEnv(key, value);
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('OWNER_GOOGLE_ACCOUNT_ID', '');
}

async function createApplication(nodeEnv = 'test') {
  configureEnvironment(nodeEnv);
  const { AppModule } = await import('../src/app.module');
  const module = await Test.createTestingModule({ imports: [AppModule], controllers: [ProbeController] }).compile();
  const application = module.createNestApplication();
  const config = application.get(ConfigService<ApiConfig, true>);
  if (nodeEnv === 'production') config.set('environment', 'Production');
  configureApi(application, config);
  await application.listen(0, '127.0.0.1');
  return application;
}

async function request(path: string, method = 'GET', headers: Record<string, string> = {}, body?: unknown): Promise<Response> {
  const requestHeaders = new Headers(headers);
  if (body !== undefined) requestHeaders.set('content-type', 'application/json');
  return fetch(`${baseUrl}${path}`, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
}

function serverUrl(application: typeof app): string {
  const address = application.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('API foundation', () => {
  beforeAll(async () => {
    app = await createApplication();
    baseUrl = serverUrl(app);
  });

  afterAll(async () => {
    await app.get(PrismaService).$disconnect();
    await app.close();
    vi.unstubAllEnvs();
  });

  test('health-returns-success-envelope', async () => {
    const response = await request('/api/v1/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { status: 'ok' }, error: null });
  });

  test('unknown-route-returns-constitution-error', async () => {
    const response = await request('/api/v1/unknown');
    const body = await response.text();
    expect(response.status).toBe(404);
    expect(JSON.parse(body)).toMatchObject({ success: false, data: null, error: { code: 'NOT_FOUND', statusCode: 404 } });
    expect(body).not.toMatch(/stack|select\s|prismaclient|cannot get/i);
  });

  test('validation-error-returns-400-with-field-errors', async () => {
    const response = await request('/api/v1/test-probe/validate', 'POST', { origin: WEB_ORIGIN, 'x-requested-with': 'cwf' }, { email: 'invalid' });
    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload).toMatchObject({ success: false, data: null, error: { code: 'VALIDATION_ERROR', statusCode: 400 } });
    expect(payload.error.details.fieldErrors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'email', reason: expect.any(String) })]));
  });

  test('helmet-and-hsts-headers-present', async () => {
    const response = await request('/api/v1/health');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('strict-transport-security')).toMatch(/max-age=31536000/);
  });

  test('cors-allows-only-web-origin', async () => {
    const allowed = await request('/api/v1/health', 'GET', { origin: WEB_ORIGIN });
    const foreign = await request('/api/v1/health', 'GET', { origin: 'https://foreign.example' });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();
  });

  test('state-change-requires-header-and-origin', async () => {
    const rejected = [] as Response[];
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      rejected.push(await request('/api/v1/test-probe/mutation', method, { origin: WEB_ORIGIN }, VALID_BODY));
      rejected.push(await request('/api/v1/test-probe/mutation', method, { 'x-requested-with': 'cwf', origin: 'https://foreign.example' }, VALID_BODY));
    }
    for (const response of rejected) {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: 'FORBIDDEN', statusCode: 403 } });
    }
  });

  test('rate-limit-returns-429-standard-error', async () => {
    let response!: Response;
    for (let index = 0; index < 101; index++) {
      response = await request('/api/v1/test-probe/rate-limit');
      if (index < 100) await response.arrayBuffer();
    }
    const payload = await response.json();
    expect(response.status).toBe(429);
    expect(payload).toMatchObject({ success: false, data: null, error: { code: 'RATE_LIMIT_EXCEEDED', statusCode: 429 } });
  });

  test('database-reachable-with-uuidv7', async () => {
    const rows = await app.get(PrismaService).$queryRaw<Array<{ id: string }>>`SELECT uuidv7() AS id`;
    expect(rows[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('swagger-ui-absent-in-production', async () => {
    const localDocs = await request('/api/docs');
    expect(localDocs.status).toBe(200);
    await localDocs.arrayBuffer();
    const productionApp = await createApplication('production');
    try {
      const response = await fetch(`${serverUrl(productionApp)}/api/docs`);
      expect(response.status).toBe(404);
    } finally {
      await productionApp.get(PrismaService).$disconnect();
      await productionApp.close();
    }
  });

  test('openapi-file-matches-running-api', async () => {
    const response = await request('/api/docs-json');
    const committed = JSON.parse(readFileSync(fileURLToPath(new URL('../openapi.json', import.meta.url)), 'utf8'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(committed);
  });
});
