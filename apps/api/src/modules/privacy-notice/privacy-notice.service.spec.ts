import { ConfigService } from '@nestjs/config';
import { describe, expect, test, vi } from 'vitest';
import { ApiConfig } from '../../common/config/config.module';
import { PrismaService } from '../../common/database/prisma.service';
import { PrivacyNoticeService } from './privacy-notice.service';

describe('privacy notice acceptance rules', () => {
  test('only a newer published material version requires acceptance', async () => {
    const latestMaterial = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ version: 2 });
    const accepted = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ id: 'consent-id' });
    const db = { privacyNoticeVersion: { findFirst: latestMaterial }, consent: { findFirst: accepted } } as unknown as PrismaService;
    const service = new PrivacyNoticeService(db, {} as ConfigService<ApiConfig, true>);
    expect(await service.requiresAcceptance('member-id')).toBe(false);
    expect(accepted).not.toHaveBeenCalled();
    expect(await service.requiresAcceptance('member-id')).toBe(true);
    expect(await service.requiresAcceptance('member-id')).toBe(false);
    expect(latestMaterial).toHaveBeenCalledWith(expect.objectContaining({ where: { publishedAtUtc: { not: null }, isMaterialChange: true } }));
    expect(accepted).toHaveBeenCalledWith(expect.objectContaining({ where: { memberId: 'member-id', privacyNoticeVersion: { version: { gte: 2 }, publishedAtUtc: { not: null } } } }));
  });

  test('requires explicit consent to the current version and preserves a prior acceptance', async () => {
    const acceptedAtUtc = new Date('2026-09-30T12:00:00.000Z');
    const upsert = vi.fn().mockResolvedValue({ acceptedAtUtc });
    const db = { privacyNoticeVersion: { findFirst: vi.fn().mockResolvedValue({ id: 'notice-id', version: 2 }) }, consent: { upsert } } as unknown as PrismaService;
    const config = { getOrThrow: vi.fn().mockReturnValue('owner@example.in') } as unknown as ConfigService<ApiConfig, true>;
    const service = new PrivacyNoticeService(db, config);
    await expect(service.accept('member-id', { version: 1, isConsentGiven: true })).rejects.toMatchObject({ response: { details: { fieldErrors: [{ field: 'version' }] } } });
    await expect(service.accept('member-id', { version: 2, isConsentGiven: false })).rejects.toMatchObject({ response: { details: { fieldErrors: [{ field: 'isConsentGiven' }] } } });
    expect(upsert).not.toHaveBeenCalled();
    expect(await service.accept('member-id', { version: 2, isConsentGiven: true })).toEqual({ version: 2, acceptedAtUtc });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: { memberId: 'member-id', privacyNoticeVersionId: 'notice-id', contactEmail: 'owner@example.in' }, update: {},
    }));
  });
});
