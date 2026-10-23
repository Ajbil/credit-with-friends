import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { CirclePage } from './circle-page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// The browser owns the real leave/rejoin flow. This transport failure check covers
// the pending window: a slow request must disable a second destructive submission.
test('done-when-1: leaving stays disabled while sending and a transport failure permits a fresh confirmation', async () => {
  const circleId = 'e4ac7e6a-97ca-4860-80fa-2823ad33b1c9';
  let rejectLeave: (error: Error) => void = () => { throw new Error('No leave request started'); };
  const fetch = vi.fn(async (input: URL, options?: RequestInit) => {
    if (input.pathname.endsWith('/leave')) return new Promise<Response>((_resolve, reject) => { rejectLeave = reject; });
    const data = input.pathname.endsWith(`/circles/${circleId}`)
      ? { id: circleId, name: 'Family', members: [
        { id: 'admin-id', displayName: 'Asha Admin', isAdmin: true },
        { id: 'member-id', displayName: 'Dev Member', isAdmin: false },
      ] }
      : { id: 'member-id' };
    if (options?.method && options.method !== 'GET') throw new Error('Unexpected write');
    return new Response(JSON.stringify({ success: true, data, error: null }));
  });
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('scrollTo', vi.fn());
  const confirm = vi.fn().mockReturnValue(true);
  vi.stubGlobal('confirm', confirm);
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: '/circles/$circleId', component: CirclePage });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: [`/circles/${circleId}`] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  try {
    await act(async () => { render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); });
    const leave = await screen.findByRole('button', { name: /^Leave circle$/ });
    const memberLink = screen.getByRole('link', { name: 'View Asha Admin’s cards' });
    expect(memberLink.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(memberLink.classList.contains('text-link')).toBe(false);
    fireEvent.click(leave);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Leaving…' }).hasAttribute('disabled')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Leaving…' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    const writes = fetch.mock.calls.filter(([url]) => url.pathname.endsWith('/leave'));
    expect(writes).toHaveLength(1);
    expect(writes[0][0].pathname).toBe(`/api/v1/circles/${circleId}/leave`);
    expect(writes[0][1]).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'cwf' } });
    await act(async () => { rejectLeave(new TypeError('Failed to fetch')); });
    expect((await screen.findByRole('alert')).textContent).toContain('Check your connection and try again.');
    const retry = screen.getByRole('button', { name: /^Leave circle$/ });
    expect(retry.hasAttribute('disabled')).toBe(false);
    confirm.mockReturnValue(false);
    fireEvent.click(retry);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.filter(([url]) => url.pathname.endsWith('/leave'))).toHaveLength(1);
  } finally { client.clear(); }
});
