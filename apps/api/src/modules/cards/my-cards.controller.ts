import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { AuthenticatedRequest } from '../sessions/session.guard';
import { AddCardDto, AddCardResponseDto, MyCardsResponseDto } from './my-cards.dto';
import { addMyCard, listMyCards } from './my-cards.service';

@ApiTags('Cards')
@ApiCookieAuth('cwf_session')
@Controller('me/cards')
export class MyCardsController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ServiceBus) private readonly bus: ServiceBus, @Inject(PinoLogger) private readonly logger: PinoLogger) {}

  @Get()
  @ApiOperation({ summary: 'List my cards', description: 'Shows all cards held by the signed-in member, including members outside circles.' })
  @ApiOkResponse({ type: MyCardsResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'Sign in to view cards.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'Finish onboarding before viewing cards.' })
  list(@Req() request: AuthenticatedRequest) { return listMyCards(this.db, request.caller.memberId!); }

  @Post()
  @ApiOperation({ summary: 'Add one of my cards', description: 'Adds a listed bank, credit or debit type, and optional variant. Never send card numbers, CVV, expiry dates or OTPs.' })
  @ApiBody({ type: AddCardDto })
  @ApiCreatedResponse({ type: AddCardResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'Invalid bank, type, long variant, or card-like variant.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'Sign in before adding cards.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'Finish onboarding before adding cards.' })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto, description: 'Duplicate card or 20-card limit.' })
  add(@Req() request: AuthenticatedRequest, @Body() body: AddCardDto) { return addMyCard(this.db, this.bus, this.logger, request.caller.memberId!, body); }
}
