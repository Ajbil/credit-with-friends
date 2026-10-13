import { expect, test } from 'vitest';
import { ApiError } from '../../../api/fetcher';
import { joinErrorMessage } from './join-error.helper';

// HTTP limit refusals are proven by the browser; these wire failures must never expose internals.
test.each([
  new TypeError('Failed to fetch'),
  new Error('Unexpected response with private server details'),
  new ApiError(500, { code: 'INTERNAL_SERVER_ERROR', message: 'Private server details' }),
  new ApiError(429, { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests.' }),
  null,
])('done-when-3: an unexpected join failure gives a safe recovery message (%s)', (error) => {
  expect(joinErrorMessage(error)).toBe('We couldn’t join this circle. Check your connection and try again.');
});
