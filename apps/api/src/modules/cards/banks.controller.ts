import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { ApiConfig } from '../../common/config/config.module';
import { PrismaService } from '../../common/database/prisma.service';
import { BanksResponseDto, parseBanksQuery } from './banks.dto';
import { listBanks } from './banks.service';

@ApiTags('Cards')
@ApiCookieAuth('cwf_session')
@Controller('banks')
export class BanksController {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List banks available for cards', description: 'Returns banks in name order and the contact address for requesting a missing bank.' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, starting at 1.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Items per page, at most 100.' })
  @ApiOkResponse({ type: BanksResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: page or limit is invalid.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to list banks.' })
  list(@Query() query: Record<string, unknown>) {
    return listBanks(this.db, parseBanksQuery(query), this.config.getOrThrow('ownerContactEmail'));
  }
}
