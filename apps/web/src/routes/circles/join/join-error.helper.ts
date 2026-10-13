import { ApiError } from '../../../api/fetcher';

export function joinErrorMessage(error: unknown): string {
  if (error instanceof ApiError && ['CIRCLE_FULL', 'TOO_MANY_CIRCLES'].includes(error.failure.code)) {
    return error.message;
  }
  return 'We couldn’t join this circle. Check your connection and try again.';
}
