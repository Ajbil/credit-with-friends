import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { ApiError } from '../../../api/fetcher';
import { JoinPage } from './join-page';

const { preview, join } = vi.hoisted(() => ({ preview: vi.fn(), join: vi.fn() }));
vi.mock('../../../api/generated', () => ({
  joinCircleControllerPreview: preview, joinCircleControllerJoin: join, accountsControllerPending: vi.fn(),
}));

afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

test('done-when-3: an invalid preview refetch replaces an earlier Join failure and hides circle details', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  preview.mockResolvedValue({ data: { data: { status: 'preview', name: 'Family', memberCount: 1 } } });
  join.mockRejectedValue(new TypeError('Failed to fetch'));
  const root = createRootRoute();
  const inviteRoute = createRoute({ getParentRoute: () => root, path: '/circles/join/$code', component: JoinPage });
  const router = createRouter({
    routeTree: root.addChildren([inviteRoute]),
    history: createMemoryHistory({ initialEntries: ['/circles/join/invite-code'] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  try {
    await act(async () => { render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); });
    const joinButton = await screen.findByRole('button', { name: /^Join$/ });
    fireEvent.click(joinButton);
    expect((await screen.findByRole('alert')).textContent).toBe('We couldn’t join this circle. Check your connection and try again.');

    const invalidMessage = 'This invite link is no longer valid. Ask the person who shared it for a new one.';
    preview.mockRejectedValue(new ApiError(404, { code: 'INVITE_LINK_INVALID', message: invalidMessage }));
    // Refetch without remounting: the real query and mutation observers retain their independent states.
    await act(async () => { await client.refetchQueries(); });

    expect((await screen.findByText(invalidMessage)).getAttribute('role')).toBe('alert');
    expect(screen.queryByRole('heading', { name: 'You’re about to join Family' })).toBeNull();
    expect(screen.queryByText('1 member')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Join$/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
  } finally { client.clear(); }
});
