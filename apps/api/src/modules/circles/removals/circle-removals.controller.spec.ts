import { describe, expect, test, vi } from 'vitest';
import type { CircleRemovalsService } from './circle-removals.service';
import { CircleRemovalsController } from './circle-removals.controller';
import type { AuthenticatedRequest } from '../../sessions/session.guard';

const circleId = '01960463-1700-7000-8000-000000000001';
const memberId = '01960463-1700-7000-8000-000000000002';
const request = { caller: { memberId } } as AuthenticatedRequest;

describe('removal input boundary', () => {
  test.each([
    { circleId: 'bad', memberId, field: 'circleId' },
    { circleId, memberId: 'bad', field: 'memberId' },
    { circleId: 'a'.repeat(36), memberId, field: 'circleId' },
  ])('rejects a malformed $field before invoking removal', async ({ circleId: candidateCircle, memberId: candidateMember, field }) => {
    const remove = vi.fn();
    const controller = new CircleRemovalsController({ remove } as unknown as CircleRemovalsService);
    await expect(controller.remove(candidateCircle, candidateMember, request)).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field, reason: 'invalid_value' }] } } });
    expect(remove).not.toHaveBeenCalled();
  });

  test('rejects a malformed clear request before invoking the service', async () => {
    const clear = vi.fn();
    const controller = new CircleRemovalsController({ clear } as unknown as CircleRemovalsService);
    await expect(controller.clear('bad', request)).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'circleId', reason: 'invalid_value' }] } } });
    expect(clear).not.toHaveBeenCalled();
  });
});
