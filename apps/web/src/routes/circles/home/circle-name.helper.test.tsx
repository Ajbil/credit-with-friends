import { expect, test } from 'vitest';
import { circleNameError } from './circle-name.helper';

// The browser's length check must agree with the API for composed user-perceived characters.
test.each([
  ['', 'Use 1 to 40 characters.'],
  [' \n\t ', 'Use 1 to 40 characters.'],
  ['x'.repeat(41), 'Use 1 to 40 characters.'],
  ['😀'.repeat(41), 'Use 1 to 40 characters.'],
  ['a', undefined],
  ['  College batch  ', undefined],
  ['x'.repeat(40), undefined],
  ['😀'.repeat(40), undefined],
  ['e\u0301'.repeat(40), undefined],
  ['👨‍👩‍👧‍👦'.repeat(40), undefined],
])('done-when-1: circle name %j has the expected validation message', (name, message) => {
  expect(circleNameError(name)).toBe(message);
});
