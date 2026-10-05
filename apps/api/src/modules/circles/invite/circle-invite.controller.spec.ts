import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../../common/database/prisma.service';
import type { ApiConfig } from '../../../common/config/config.module';
import type { ServiceBus } from '../../../service-bus/service-bus.service';
import type { PinoLogger } from 'nestjs-pino';
import type { AuthenticatedRequest } from '../../sessions/session.guard';
import { describe, expect, test, vi } from 'vitest';
import { CircleInviteController } from './circle-invite.controller';

const circleId = '01960463-1700-7000-8000-000000000001';
const adminId = '01960463-1700-7000-8000-000000000002';
const otherId = '01960463-1700-7000-8000-000000000003';
const code = 'ZJUnCsFn69xUJxhBPxJg6A';
const request = (memberId: string) => ({ caller: { memberId } }) as AuthenticatedRequest;

function setup(publish: () => Promise<void> = async () => {}) {
  const circle = { id: circleId, name: 'College batch', inviteCode: code, adminMemberId: adminId, deletedAtUtc: null };
  const findUnique = vi.fn(async () => circle);
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const db = { circle: { findUnique, updateMany } } as unknown as PrismaService;
  const bus = { publish: vi.fn(publish) } as unknown as ServiceBus;
  const config = { getOrThrow: () => 'http://localhost:5173' } as unknown as ConfigService<ApiConfig, true>;
  const logger = { warn: vi.fn() } as unknown as PinoLogger;
  return { controller: new CircleInviteController(db, bus, config, logger), findUnique, updateMany, bus };
}

describe('circle invite controller', () => {
  test('refuses non-admin access to get, reset, and record', async () => {
    const { controller, updateMany, bus } = setup();
    await expect(controller.get(circleId, request(otherId))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.reset(circleId, request(otherId))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.record(circleId, request(otherId), { action: 'copy' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateMany).not.toHaveBeenCalled();
    expect(bus.publish).not.toHaveBeenCalled();
  });

  test('resets the link and prepares WhatsApp text with the circle name and active link', async () => {
    const { controller, updateMany } = setup();
    const previous = await controller.get(circleId, request(adminId));
    const reset = await controller.reset(circleId, request(adminId));
    expect(reset.url).not.toBe(previous.url);
    expect(reset.url).toMatch(/^http:\/\/localhost:5173\/circles\/join\/[A-Za-z0-9_-]{22}$/);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: circleId, adminMemberId: adminId, deletedAtUtc: null }, data: expect.objectContaining({ modifiedByAccountId: adminId }) }));
    const share = await controller.record(circleId, request(adminId), { action: 'whatsapp' });
    const text = new URL(share.whatsappUrl!).searchParams.get('text');
    expect(text).toContain('College batch');
    expect(text).toContain(previous.url);
  });

  test('copy and WhatsApp share return while usage recording remains pending', async () => {
    const { controller } = setup(() => new Promise<void>(() => {}));
    const copy = await controller.record(circleId, request(adminId), { action: 'copy' });
    const share = await controller.record(circleId, request(adminId), { action: 'whatsapp' });
    expect(copy.recorded).toBe(true);
    expect(share.whatsappUrl).toContain('wa.me');
  }, 2_000);
});
