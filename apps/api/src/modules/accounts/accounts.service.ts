import { BadRequestException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ApiConfig } from '../../common/config/config.module';
import { PrismaService } from '../../common/database/prisma.service';
import { Caller, SessionsService } from '../sessions/sessions.service';
import { OnboardingDto } from './dto/onboarding.dto';
import { renderPrivacyNotice } from '../privacy-notice/privacy-notice.service';

export type GoogleIdentity = { googleAccountId: string; email: string; name: string; emailVerified: boolean };

export function safeReturnPath(value?: string): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !Array.from(value).some((character) => character === '\\' || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ? value : '/';
}

@Injectable()
export class AccountsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(ConfigService) private readonly config: ConfigService<ApiConfig, true>,
  ) {}

  async signIn(identity: GoogleIdentity, userAgent?: string, returnPath = '/') {
    if (!identity.emailVerified) throw new ForbiddenException();
    const member = await this.db.member.findUnique({ where: { googleAccountId: identity.googleAccountId } });
    if (!member && !this.config.getOrThrow('launchOpen') && !this.config.getOrThrow('prelaunchAllowedEmails').includes(identity.email.toLowerCase())) {
      throw new ForbiddenException({ code: 'NOT_OPEN_YET' });
    }
    if (member) {
      await this.db.member.update({ where: { id: member.id }, data: { googleEmail: identity.email } });
      return { token: await this.sessions.create({ memberId: member.id }, userAgent, safeReturnPath(returnPath)), status: 'member' as const, returnPath: safeReturnPath(returnPath) };
    }
    const pending = await this.db.pendingSignIn.upsert({
      where: { googleAccountId: identity.googleAccountId },
      create: { googleAccountId: identity.googleAccountId, googleName: identity.name, googleEmail: identity.email },
      update: { googleName: identity.name, googleEmail: identity.email, lastActivityAtUtc: new Date() },
    });
    return { token: await this.sessions.create({ pendingSignInId: pending.id }, userAgent, safeReturnPath(returnPath)), status: 'pending' as const, returnPath: safeReturnPath(returnPath) };
  }

  async pending(caller: Caller) {
    if (!caller.pendingSignInId) throw new ForbiddenException();
    const pending = await this.db.pendingSignIn.findUnique({ where: { id: caller.pendingSignInId }, select: { googleName: true, googleEmail: true } });
    if (!pending) throw new UnauthorizedException();
    const session = await this.db.session.findUniqueOrThrow({ where: { id: caller.sessionId }, select: { returnPath: true } });
    return { name: pending.googleName, email: pending.googleEmail, returnPath: session.returnPath };
  }

  async notice() {
    const version = await this.db.privacyNoticeVersion.findFirst({ where: { publishedAtUtc: { not: null } }, orderBy: { version: 'desc' }, select: { version: true, text: true } });
    if (!version) throw new ForbiddenException('The privacy notice is not available yet.');
    return { version: version.version, text: renderPrivacyNotice(version.text, this.config.getOrThrow('ownerContactEmail')) };
  }

  async onboard(caller: Caller, input: OnboardingDto) {
    if (caller.memberId) return this.profile(caller.memberId);
    if (!caller.pendingSignInId) throw new UnauthorizedException();
    const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
    const phone = typeof input.whatsappNumber === 'string' ? parsePhoneNumberFromString(input.whatsappNumber, 'IN') : undefined;
    const fieldErrors = [
      ...(!displayName || displayName.length > 50 ? [{ field: 'displayName', reason: 'Use 1 to 50 characters.' }] : []),
      ...(!phone?.isValid() ? [{ field: 'whatsappNumber', reason: 'Enter a valid phone number with a country code.' }] : []),
      ...(input.isAdultConfirmed !== true ? [{ field: 'isAdultConfirmed', reason: 'Confirm you are 18 or older.' }] : []),
      ...(input.isConsentGiven !== true ? [{ field: 'isConsentGiven', reason: 'Accept the privacy notice to continue.' }] : []),
      ...(!Number.isInteger(input.privacyNoticeVersion) ? [{ field: 'privacyNoticeVersion', reason: 'Accept the current privacy notice.' }] : []),
    ];
    if (fieldErrors.length) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors } });
    const notice = await this.db.privacyNoticeVersion.findUnique({ where: { version: input.privacyNoticeVersion } });
    const latest = await this.db.privacyNoticeVersion.findFirst({ where: { publishedAtUtc: { not: null } }, orderBy: { version: 'desc' } });
    if (!notice?.publishedAtUtc || latest?.id !== notice.id) throw new BadRequestException({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'privacyNoticeVersion', reason: 'Accept the current privacy notice.' }] } });

    const pending = await this.db.pendingSignIn.findUnique({ where: { id: caller.pendingSignInId } });
    if (!pending) {
      const current = await this.db.session.findUnique({ where: { id: caller.sessionId } });
      if (current?.memberId) return this.profile(current.memberId);
      throw new UnauthorizedException();
    }
    let member;
    try {
      member = await this.db.$transaction(async (tx) => {
        await tx.pendingSignIn.update({ where: { id: pending.id }, data: { lastActivityAtUtc: new Date() } });
        const created = await tx.member.create({ data: {
          googleAccountId: pending.googleAccountId, googleEmail: pending.googleEmail,
          displayName, whatsappE164: phone!.number, isAdultConfirmed: true,
        } });
        await tx.consent.create({ data: { memberId: created.id, privacyNoticeVersionId: notice.id, contactEmail: this.config.getOrThrow('ownerContactEmail') } });
        await tx.session.updateMany({ where: { pendingSignInId: pending.id }, data: { pendingSignInId: null, memberId: created.id } });
        await tx.pendingSignIn.delete({ where: { id: pending.id } });
        return created;
      });
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2025') throw error;
      member = await this.db.member.findUnique({ where: { googleAccountId: pending.googleAccountId } });
      if (!member) throw new UnauthorizedException();
    }
    return this.profile(member.id);
  }

  async profile(memberId: string) {
    const member = await this.db.member.findUnique({ where: { id: memberId }, select: { id: true, displayName: true, whatsappE164: true, googleEmail: true, googleAccountId: true } });
    if (!member) throw new UnauthorizedException();
    return member;
  }

  async cancel(caller: Caller) {
    if (!caller.pendingSignInId) throw new ForbiddenException();
    await this.db.pendingSignIn.delete({ where: { id: caller.pendingSignInId } });
    return { removed: true };
  }
}
