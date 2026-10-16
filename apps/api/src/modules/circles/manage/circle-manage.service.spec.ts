import { BadRequestException } from '@nestjs/common';
import { describe, expect, test } from 'vitest';
import { parseRenameName } from './circle-manage.service';

describe('circle rename name', () => {
  test.each([
    ['  Family  ', 'Family'],
    ['é'.repeat(40), 'é'.repeat(40)],
    ['😀'.repeat(40), '😀'.repeat(40)],
  ])('accepts a valid grapheme-counted name', (input, expected) => {
    expect(parseRenameName(input)).toBe(expected);
  });

  test.each([undefined, null, 3, '', '  ', 'x'.repeat(41), '😀'.repeat(41)])('uses the creation rule and field error for %s', (input) => {
    try {
      parseRenameName(input);
      throw new Error('Expected invalid name to be refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'name', reason: 'Use 1 to 40 characters.' }] } });
    }
  });
});
