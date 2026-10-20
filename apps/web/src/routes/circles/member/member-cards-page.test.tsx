import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { MemberCardsPage } from './member-cards-page';

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

async function showMember() {
  vi.stubGlobal('scrollTo', vi.fn());
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: '/circles/$circleId/members/$memberId/cards', component: MemberCardsPage });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/circles/shared-circle/members/dev-member/cards'] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  clients.push(client);
  await act(async () => { render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); });
  return client;
}

function memberResponse(cards: Array<{ id: string; bankId: string; bankName: string; type: 'credit' | 'debit'; variant: string | null }> = []) {
  return Response.json({ success: true, data: { memberId: 'dev-member', displayName: 'Dev Member', cards }, error: null });
}

// The browser owns the successful real-API flow. These tests hold or fail the
// transport to exercise query lifecycle windows without replacing the client.
test('done-when-4: loading never flashes the no-cards state before the member response', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  await showMember();
  expect(screen.getByRole('status').textContent).toBe('Loading this member’s cards…');
  expect(screen.queryByText('No cards listed yet')).toBeNull();
  await act(async () => { finish(memberResponse()); });
  expect(await screen.findByRole('heading', { name: 'Dev Member’s cards' })).toBeDefined();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByRole('heading', { name: 'No cards listed yet' })).toBeDefined();
});

test('done-when-4: retry stays disabled during a slow request and then recovers', async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal('fetch', fetch);
  await showMember();
  expect((await screen.findByRole('alert')).textContent).toContain('Check your connection and try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Trying again…' }).hasAttribute('disabled')).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Trying again…' }));
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => { finish(memberResponse()); });
  expect(await screen.findByRole('heading', { name: 'No cards listed yet' })).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('done-when-4: a failed background refresh keeps shown cards but not-found hides cached member data', async () => {
  let finish!: (response: Response) => void;
  const unavailableResponse = () => Response.json({
    success: false, data: null, error: { code: 'CIRCLE_NOT_FOUND', message: 'This circle is not available.' },
  }, { status: 404 });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(memberResponse([
    { id: 'card-id', bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'credit', variant: 'Millennia' },
  ])).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(unavailableResponse())
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })));
  const client = await showMember();
  expect(await screen.findByRole('list', { name: 'Member cards' })).toBeDefined();
  await act(async () => { await client.refetchQueries(); });
  expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t refresh these cards.');
  expect(screen.getByRole('list', { name: 'Member cards' }).textContent).toContain('Millennia');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'Member cards unavailable' })).toBeDefined();
  expect(screen.queryByRole('list', { name: 'Member cards' })).toBeNull();
  expect(screen.queryByText(/Dev Member|Millennia/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Back to circle' }).getAttribute('href')).toBe('/circles/shared-circle');
  expect(screen.getByRole('link', { name: 'Back to your circles' }).getAttribute('href')).toBe('/');
  expect(document.title).toBe('Member cards | CreditWithFriends');
  // A later refresh must not resurrect cards already refused by the server.
  let refresh!: Promise<void>;
  await act(async () => { refresh = client.refetchQueries(); });
  expect(screen.queryByText(/Dev Member|Millennia/)).toBeNull();
  await act(async () => { finish(unavailableResponse()); await refresh; });
});
