import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { ApiConfig } from '../config/config.module';

export function apiPinoOptions(environment: ApiConfig['environment']) {
  return {
    base: { environment, serviceName: 'credit-with-friends-api', moduleName: 'api' },
    customProps: (request: IncomingMessage) => ({ correlationId: String(request.id), requestId: String(request.id) }),
    formatters: { level: (label: string) => ({ level: label }) },
    genReqId: () => randomUUID(),
    messageKey: 'message',
    redact: {
      paths: [
        'accessToken', 'authorization', 'cookie', 'displayName', 'email', 'googleAccountId', 'name', 'password',
        'query', 'refreshToken', 'req', 'token', 'whatsAppNumber', 'whatsappNumber',
      ],
      censor: '[REDACTED]',
    },
    timestamp: () => `,"timestampUtc":"${new Date().toISOString()}"`,
  };
}
