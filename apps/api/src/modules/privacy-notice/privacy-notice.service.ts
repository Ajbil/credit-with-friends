import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AcceptNoticeDto } from './dto/accept-notice.dto';

export function renderPrivacyNotice(text: string, contactEmail: string): string {
  return text.replaceAll('{{OWNER_CONTACT_EMAIL}}', contactEmail);
}

@Injectable()
export class PrivacyNoticeService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async requiresAcceptance(memberId: string): Promise<boolean> {
    const latestMaterial = await this.db.privacyNoticeVersion.findFirst({
      where: { publishedAtUtc: { not: null }, isMaterialChange: true }, orderBy: { version: 'desc' }, select: { version: true },
    });
    if (!latestMaterial) return false;
    const accepted = await this.db.consent.findFirst({
      where: { memberId, privacyNoticeVersion: { version: { gte: latestMaterial.version }, publishedAtUtc: { not: null } } },
      select: { id: true },
    });
    return !accepted;
  }

  async accept(memberId: string, input: AcceptNoticeDto) {
    const latest = await this.db.privacyNoticeVersion.findFirst({
      where: { publishedAtUtc: { not: null } }, orderBy: { version: 'desc' }, select: { id: true, version: true },
    });
    if (input.isConsentGiven !== true || !latest || input.version !== latest.version) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: input.isConsentGiven !== true ? 'isConsentGiven' : 'version', reason: 'Accept the current privacy notice to continue.' }] } });
    }
    const consent = await this.db.consent.upsert({
      where: { memberId_privacyNoticeVersionId: { memberId, privacyNoticeVersionId: latest.id } },
      create: { memberId, privacyNoticeVersionId: latest.id }, update: {}, select: { acceptedAtUtc: true },
    });
    return { version: latest.version, acceptedAtUtc: consent.acceptedAtUtc };
  }
}
