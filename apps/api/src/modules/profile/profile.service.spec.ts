import { describe, expect, test, vi } from 'vitest';
import { PrismaService } from '../../common/database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';

describe('profile edit rules', () => {
  test.each([
    [{ displayName: '   ' }, 'displayName', 'Use 1 to 50 characters.'],
    [{ displayName: 'x'.repeat(51) }, 'displayName', 'Use 1 to 50 characters.'],
    [{ whatsappNumber: '12' }, 'whatsappNumber', 'Enter a valid phone number with a country code.'],
  ])('rejects invalid edits before changing the profile', async (input, field, reason) => {
    const update = vi.fn();
    const db = { member: { findUnique: vi.fn(), update } } as unknown as PrismaService;
    const service = new ProfileService(db);
    await expect(service.update('member-id', input as UpdateProfileDto)).rejects.toMatchObject({
      response: { details: { fieldErrors: [{ field, reason }] } },
    });
    expect(update).not.toHaveBeenCalled();
  });

  test('trims the name and normalises Indian and international phone numbers', async () => {
    const update = vi.fn().mockImplementation(async ({ data }) => ({ id: 'member-id', ...data, googleEmail: 'self@example.in', googleAccountId: 'google-self' }));
    const db = { member: { findUnique: vi.fn().mockResolvedValue({ id: 'member-id' }), update } } as unknown as PrismaService;
    const service = new ProfileService(db);
    await service.update('member-id', { displayName: '  New Name  ', whatsappNumber: '9876543210' });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { displayName: 'New Name', whatsappE164: '+919876543210' } }));
    await service.update('member-id', { whatsappNumber: '+447911123456' });
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { whatsappE164: '+447911123456' } }));
  });
});
