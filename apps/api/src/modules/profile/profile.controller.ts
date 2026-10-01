import { Body, Controller, Inject, Patch, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/api/api.dto';
import { MemberResponseDto } from '../accounts/dto/account-response.dto';
import { AuthenticatedRequest } from '../sessions/session.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('Profile')
@ApiCookieAuth('cwf_session')
@Controller('members/me')
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profile: ProfileService) {}

  @Patch()
  @ApiOperation({ summary: 'Edit your own member profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiOkResponse({ type: MemberResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  update(@Req() request: AuthenticatedRequest, @Body() body: UpdateProfileDto) {
    return this.profile.update(request.caller.memberId!, body);
  }
}
