import { BadRequestException } from '@nestjs/common';
import { describe, expect, test } from 'vitest';
import { parseListCirclesQuery } from './list-circles.dto';

describe('circle list paging', () => {
  test('accepts defaults and the highest allowed limit', () => {
    expect(parseListCirclesQuery({})).toEqual({ page: 1, limit: 20 });
    expect(parseListCirclesQuery({ page: '2', limit: '100' })).toEqual({ page: 2, limit: 100 });
  });

  test.each([
    [{ page: '0' }, 'page'],
    [{ page: '01' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ page: '9007199254740993' }, 'page'],
    [{ page: ['1', '2'] }, 'page'],
    [{ limit: '101' }, 'limit'],
    [{ limit: '1e2' }, 'limit'],
    [{ other: '1' }, 'other'],
  ])('rejects invalid paging query %j', (query, field) => {
    try {
      parseListCirclesQuery(query);
      throw new Error('Expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { fieldErrors: [{ field }] },
      });
    }
  });
});
