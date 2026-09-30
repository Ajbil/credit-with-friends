import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { PrismaService } from '../../common/database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async update(memberId: string, input: UpdateProfileDto) {
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : undefined;
    const phone = typeof input.whatsappNumber === 'string' ? parsePhoneNumberFromString(input.whatsappNumber, 'IN') : undefined;
    const fieldErrors = [
      ...(input.displayName !== undefined && (!displayName || displayName.length > 50) ? [{ field: 'displayName', reason: 'Use 1 to 50 characters.' }] : []),
      ...(input.whatsappNumber !== undefined && !phone?.isValid() ? [{ field: 'whatsappNumber', reason: 'Enter a valid phone number with a country code.' }] : []),
    ];
    if (fieldErrors.length) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors } });
    const member = await this.db.member.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) throw new UnauthorizedException();
    const updated = await this.db.member.update({
      where: { id: memberId },
      data: { ...(displayName !== undefined ? { displayName } : {}), ...(phone ? { whatsappE164: phone.number } : {}) },
      select: { id: true, displayName: true, whatsappE164: true, googleEmail: true, googleAccountId: true },
    });
    return { id: updated.id, displayName: updated.displayName, whatsappE164: updated.whatsappE164, googleEmail: updated.googleEmail, googleAccountId: updated.googleAccountId };
  }
}
