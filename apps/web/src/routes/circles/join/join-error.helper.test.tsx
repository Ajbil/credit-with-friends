import { expect, test } from 'vitest';
import { ApiError } from '../../../api/fetcher';
import { joinErrorMessage } from './join-error.helper';

// HTTP limit refusals are proven by the browser; these wire failures must never expose internals.
test.each([
  new TypeError('Failed to fetch'),
  new Error('Unexpected response with private server details'),
  new ApiError(500, { code: 'INTERNAL_SERVER_ERROR', message: 'Private server details' }),
  null,
])('done-when-3: an unexpected join failure gives a safe recovery message (%s)', (error) => {
  expect(joinErrorMessage(error)).toBe('We couldn’t join this circle. Check your connection and try again.');
});

// A known rate-limit refusal needs waiting advice rather than the former connection fallback.
test('done-when-3: a rate-limited join tells the person to wait before trying again', () => {
  expect(joinErrorMessage(new ApiError(429, { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' })))
    .toBe('Too many attempts. Wait a moment before trying again.');
});
