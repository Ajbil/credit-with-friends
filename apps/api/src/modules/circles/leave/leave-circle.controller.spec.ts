import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../sessions/session.guard';
import type { CirclesCoreService } from '../core/circles-core.service';
import { LeaveCircleController } from './leave-circle.controller';

const circleId = '01960463-1700-7000-8000-000000000001';
const memberId = '01960463-1700-7000-8000-000000000002';
const request = { caller: { memberId } } as AuthenticatedRequest;

describe('leave circle controller', () => {
  test('validates the circle ID before passing the caller to membership ending and waits for completion', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const endMembership = vi.fn(() => pending);
    const controller = new LeaveCircleController({ endMembership } as unknown as CirclesCoreService);

    await expect(controller.leave('not-a-uuid', request)).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR' } });
    expect(endMembership).not.toHaveBeenCalled();

    const response = controller.leave(circleId, request);
    expect(endMembership).toHaveBeenCalledExactlyOnceWith(circleId, memberId);
    let settled = false;
    void response.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await expect(response).resolves.toBeNull();
  });

  test('propagates a missing membership as not found', async () => {
    const endMembership = vi.fn().mockRejectedValue(new NotFoundException());
    const controller = new LeaveCircleController({ endMembership } as unknown as CirclesCoreService);

    await expect(controller.leave(circleId, request)).rejects.toBeInstanceOf(NotFoundException);
    expect(endMembership).toHaveBeenCalledExactlyOnceWith(circleId, memberId);
  });
});
