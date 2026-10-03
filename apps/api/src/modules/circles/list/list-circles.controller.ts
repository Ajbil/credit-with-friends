import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class ListCirclesController {
  @Get()
  @ApiOperation({ summary: 'List your circles' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the circles list task.' })
  list(): never { throw new NotImplementedException(); }
}
