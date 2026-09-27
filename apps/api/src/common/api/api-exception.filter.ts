import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { ApiConfig } from '../config/config.module';

type RequestContext = { correlationId?: string; requestId?: string };
type ValidationResponse = { code?: string; details?: { fieldErrors?: Array<{ field?: unknown; reason?: unknown }> } };

function validationDetails(response: string | object): { fieldErrors: Array<{ field: string; reason: string }> } | Record<string, never> {
  const errors = (response as ValidationResponse)?.details?.fieldErrors;
  if (!Array.isArray(errors)) return {};
  return {
    fieldErrors: errors.flatMap(({ field, reason }) => typeof field === 'string' && typeof reason === 'string' ? [{ field, reason }] : []),
  };
}

function errorCode(status: number, response: string | object): string {
  if ((response as ValidationResponse)?.code === 'VALIDATION_ERROR') return 'VALIDATION_ERROR';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMIT_EXCEEDED';
  return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_FAILED';
}

function errorMessage(code: string): string {
  return ({
    FORBIDDEN: 'This request is not allowed.',
    INTERNAL_SERVER_ERROR: 'The request could not be completed.',
    NOT_FOUND: 'The requested resource was not found.',
    RATE_LIMIT_EXCEEDED: 'Too many requests.',
    REQUEST_FAILED: 'The request could not be completed.',
    VALIDATION_ERROR: 'Input validation failed.',
  } as Record<string, string>)[code];
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(PinoLogger) private readonly logger: PinoLogger,
    @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = exception instanceof HttpException ? exception.getResponse() : {};
    const statusCode = exception instanceof HttpException ? exception.getStatus() : 500;
    const code = errorCode(statusCode, typeof response === 'object' ? response : {});
    const errorId = randomUUID();
    const correlationId = request.correlationId ?? randomUUID();
    const requestId = request.requestId ?? null;
    const message = errorMessage(code);
    const payload = {
      success: false,
      error: {
        errorId, code, type: code === 'VALIDATION_ERROR' ? 'ValidationError' : statusCode >= 500 ? 'InternalError' : 'HttpError',
        message, userMessage: message, details: validationDetails(typeof response === 'object' ? response : {}),
        statusCode, correlationId, requestId, environment: this.config.getOrThrow('environment'), timestampUtc: new Date().toISOString(),
      },
      data: null,
    };
    const context = { errorId, statusCode, code, correlationId, requestId };
    if (code === 'VALIDATION_ERROR') this.logger.debug({ context }, 'Request validation failed');
    else this.logger.error({ context }, statusCode >= 500 ? 'Unhandled request error' : 'Request failed');
    http.getResponse().status(statusCode).json(payload);
  }
}
