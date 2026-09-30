import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiConfig } from '../../common/config/config.module';
import { PrismaService } from '../../common/database/prisma.service';
import { AcceptNoticeDto } from './dto/accept-notice.dto';

@Injectable()
export class PrivacyNoticeService implements OnModuleInit {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>) {}

  async onModuleInit(): Promise<void> {
    const notice = await this.db.privacyNoticeVersion.findUnique({ where: { version: 1 }, select: { id: true, text: true } });
    if (!notice?.text.includes('{{OWNER_CONTACT_EMAIL}}')) return;
    await this.db.privacyNoticeVersion.updateMany({
      where: { id: notice.id, text: notice.text },
      data: { text: notice.text.replace('{{OWNER_CONTACT_EMAIL}}', this.config.getOrThrow('ownerContactEmail')) },
    });
  }

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
