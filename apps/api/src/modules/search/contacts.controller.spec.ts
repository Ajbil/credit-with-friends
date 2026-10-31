import { BadRequestException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, test } from 'vitest';
import type { PrismaService } from '../../common/database/prisma.service';
import type { ServiceBus } from '../../service-bus/service-bus.service';
import type { AuthenticatedRequest } from '../sessions/session.guard';
import { ContactsController } from './contacts.controller';

describe('contact request validation', () => {
  test('a malformed card id is invalid input before a database request', async () => {
    const controller = new ContactsController(null as unknown as PrismaService, null as unknown as ServiceBus, null as unknown as PinoLogger);
    let error: unknown;
    try {
      await controller.contact({ caller: { memberId: 'shopper' } } as AuthenticatedRequest, { cardId: 'bad' });
    } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'cardId', reason: 'invalid_value' }] } });
  });
});
