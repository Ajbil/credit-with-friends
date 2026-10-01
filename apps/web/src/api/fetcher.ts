/// <reference types="vite/client" />

export type ApiFailure = {
  code: string;
  message: string;
  details?: { fieldErrors?: Array<{ field: string; reason: string }> };
};

export class ApiError extends Error {
  constructor(readonly status: number, readonly failure: ApiFailure) {
    super(failure.message);
  }
}

const apiOrigin = import.meta.env.VITE_API_ORIGIN || 'http://localhost:3000';

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? 'GET';
  const response = await fetch(new URL(url, apiOrigin), {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
      ...(method === 'GET' ? {} : { 'X-Requested-With': 'cwf' }),
    },
  });
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('success' in body)) throw new Error('The server sent an unexpected response. Please try again.');
  if (body.success !== true) {
    const error = 'error' in body ? body.error : null;
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error && typeof error.code === 'string' && typeof error.message === 'string') {
      throw new ApiError(response.status, error as ApiFailure);
    }
    throw new Error('The request failed. Please try again.');
  }
  return { data: body, status: response.status, headers: response.headers } as T;
}

export function googleStartUrl(returnTo: string): string {
  const url = new URL('/api/v1/auth/google/start', apiOrigin);
  url.searchParams.set('returnTo', returnTo);
  return url.toString();
}
