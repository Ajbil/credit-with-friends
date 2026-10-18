import { ArgumentsHost, BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, test, vi } from 'vitest';
import { ApiExceptionFilter } from '../../common/api/api-exception.filter';
import { ApiConfig } from '../../common/config/config.module';

const cases: Array<{ code: string; status: number; message: string; field?: string }> = [
  { code: 'CARD_BANK_UNKNOWN', status: 400, message: 'Choose a bank from the list.', field: 'bankId' },
  { code: 'CARD_VARIANT_TOO_LONG', status: 400, message: 'Use at most 40 characters.', field: 'variant' },
  { code: 'CARD_VARIANT_UNSAFE', status: 400, message: 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.', field: 'variant' },
  { code: 'CARD_DUPLICATE', status: 409, message: "You've already listed this card." },
  { code: 'CARD_LIMIT', status: 409, message: 'You can list at most 20 cards.' },
];

describe('card refusal API error contract', () => {
  test.each(cases)('$code returns its status, message and error placement', ({ code, status, message, field }) => {
    const logger = { debug: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
    const config = { getOrThrow: () => 'Local' } as unknown as ConfigService<ApiConfig, true>;
    const filter = new ApiExceptionFilter(logger, config);
    const json = vi.fn();
    const response = { status: vi.fn().mockReturnValue({ json }) };
    const host = {
      switchToHttp: () => ({ getRequest: () => ({ correlationId: 'test-correlation' }), getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const details = field ? { fieldErrors: [{ field, reason: message }] } : {};
    const exception: HttpException = status === 400
      ? new BadRequestException({ code, details })
      : new ConflictException({ code, details });

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(status);
    expect(json).toHaveBeenCalledWith({
      success: false,
      data: null,
      error: expect.objectContaining({ code, statusCode: status, message, userMessage: message, details, correlationId: 'test-correlation' }),
    });
    expect(logger.debug).toHaveBeenCalledOnce();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
