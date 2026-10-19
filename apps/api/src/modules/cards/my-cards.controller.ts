import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PinoLogger } from 'nestjs-pino';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { PrismaService } from '../../common/database/prisma.service';
import { ServiceBus } from '../../service-bus/service-bus.service';
import { AuthenticatedRequest } from '../sessions/session.guard';
import { AddCardDto, AddCardResponseDto, EditCardDto, MyCardsResponseDto, RemoveCardResponseDto } from './my-cards.dto';
import { addMyCard, editMyCard, listMyCards, removeMyCard } from './my-cards.service';

function validateCardId(cardId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cardId)) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'cardId', reason: 'invalid_value' }] } });
  }
}

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

  @Patch(':cardId')
  @ApiOperation({ summary: 'Edit one of my cards', description: 'Changes the selected fields on a card you hold. Never send card numbers, CVV, expiry dates or OTPs.' })
  @ApiParam({ name: 'cardId', type: String, example: '0199e379-4302-7c2a-a332-9a2e80dabefe' })
  @ApiBody({ type: EditCardDto })
  @ApiOkResponse({ type: AddCardResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'Invalid card id, bank, type, long variant, or card-like variant.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'Sign in before editing cards.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'Finish onboarding before editing cards.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'Card not found among your cards.' })
  @ApiResponse({ status: 409, type: ApiErrorResponseDto, description: 'Duplicate card.' })
  edit(@Req() request: AuthenticatedRequest, @Param('cardId') cardId: string, @Body() body: EditCardDto) {
    validateCardId(cardId);
    return editMyCard(this.db, this.bus, request.caller.memberId!, cardId, body);
  }

  @Delete(':cardId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove one of my cards', description: 'Permanently removes a card you hold so it disappears from card lists.' })
  @ApiParam({ name: 'cardId', type: String, example: '0199e379-4302-7c2a-a332-9a2e80dabefe' })
  @ApiOkResponse({ type: RemoveCardResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'Invalid card id.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'Sign in before removing cards.' })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto, description: 'Finish onboarding before removing cards.' })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto, description: 'Card not found among your cards.' })
  async remove(@Req() request: AuthenticatedRequest, @Param('cardId') cardId: string): Promise<null> {
    validateCardId(cardId);
    await removeMyCard(this.db, this.bus, request.caller.memberId!, cardId);
    return null;
  }
}
