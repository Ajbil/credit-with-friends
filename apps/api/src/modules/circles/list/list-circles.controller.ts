import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../common/api/api.dto';
import { ListCirclesResponseDto } from './list-circles.dto';

@ApiTags('Circles')
@ApiCookieAuth('cwf_session')
@Controller('circles')
export class ListCirclesController {
  @Get()
  @ApiOperation({ summary: 'List your circles' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, starting at 1.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Items per page, at most 100.' })
  @ApiOkResponse({ type: ListCirclesResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorResponseDto, description: 'VALIDATION_ERROR: page or limit is invalid.' })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto, description: 'UNAUTHORIZED: sign in to list your circles.' })
  @ApiResponse({ status: 501, type: ApiErrorResponseDto, description: 'Available in the circles list task.' })
  list(): never { throw new NotImplementedException(); }
}
