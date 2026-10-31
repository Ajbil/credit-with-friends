import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { AuthenticatedRequest } from '../sessions/session.guard';
import { ContactCardDto, ContactResponseDto } from './contacts.dto';
import { contactCard } from './contacts.service';

@ApiTags('Search')
@ApiCookieAuth('cwf_session')
@Controller('contacts')
export class ContactsController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ServiceBus) private readonly bus: ServiceBus, @Inject(PinoLogger) private readonly logger: PinoLogger) {}

  @Post()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Open WhatsApp for a current card holder', description: 'Checks that the card and a shared circle are still available, then returns a chat link. The app sends no message.' })
  @ApiBody({ type: ContactCardDto })
  @ApiCreatedResponse({ type: ContactResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: cardId must be a UUID.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'Sign in to contact a holder.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'Finish onboarding or accept the current privacy notice.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'CARD_UNAVAILABLE: the card or a shared circle is no longer available.' })
  @ApiResponse({ status: 429, type: ApiErrorResponseDto, description: 'Contact rate limit exceeded.' })
  contact(@Req() request: AuthenticatedRequest, @Body() body: ContactCardDto) {
    return contactCard(this.db, this.bus, this.logger, request.caller.memberId!, body.cardId);
  }
}
