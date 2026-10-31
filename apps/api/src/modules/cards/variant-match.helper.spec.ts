import { describe, expect, test } from 'vitest';
import { matchCardVariant } from './variant-match.helper';

describe('card variant matching', () => {
  test.each([
    ['flipkart', 'Flipkart', 'matching'],
    ['flipkart', 'Flip-Kart', 'matching'],
    ['flipkart', 'flip kart', 'matching'],
    ['flipkart', 'Flipkart Axis', 'matching'],
    ['flipkart', 'flipkat', 'similar'],
    ['flipkart', 'flpkat', 'similar'],
    ['flipkat', 'Flipkart', 'similar'],
    ['flipkart', 'FKT', null],
    ['flipkart', 'Millennia', null],
    ['flipkart', 'Ace', null],
    ['flipkart', null, 'unstated'],
    ['abc', 'axbc', null],
    ['abcd', 'abxcd', 'similar'],
    ['abcdefg', 'abcxdefg', 'similar'],
    ['abcdefgh', 'abcxydefgh', 'similar'],
    ['abcdefgh', 'abcxyzdefgh', null],
    ['...', 'Millennia', 'all'],
    ['  ', 'Millennia', 'all'],
    [undefined, 'Millennia', 'all'],
  ] as const)('entry %s against card %s is %s', (entry, cardVariant, expected) => {
    expect(matchCardVariant(entry, cardVariant)).toBe(expected);
  });
});
