import { describe, expect, test, vi } from 'vitest';
import type { PrismaService } from '../../../common/database/prisma.service';
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
    const transaction = vi.fn();
    const controller = new CircleRemovalsController({ $transaction: transaction } as unknown as PrismaService);
    await expect(controller.remove(candidateCircle, candidateMember, request)).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field, reason: 'invalid_value' }] } } });
    expect(transaction).not.toHaveBeenCalled();
  });

  test('rejects a malformed clear request before invoking the service', async () => {
    const transaction = vi.fn();
    const controller = new CircleRemovalsController({ $transaction: transaction } as unknown as PrismaService);
    await expect(controller.clear('bad', request)).rejects.toMatchObject({ status: 400, response: { code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'circleId', reason: 'invalid_value' }] } } });
    expect(transaction).not.toHaveBeenCalled();
  });
});
