import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { CardsPage } from './cards-page';

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

async function showCards() {
  vi.stubGlobal('scrollTo', vi.fn());
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: '/cards', component: CardsPage });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/cards'] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  clients.push(client);
  await act(async () => { render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); });
}

test('done-when-1: your cards explains an empty list after loading without requiring a circle', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  await showCards();
  expect(screen.getByRole('status').textContent).toContain('Loading your cards');
  expect(screen.queryByText('No cards yet')).toBeNull();
  await act(async () => { finish(Response.json({ success: true, data: { items: [], pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } }, error: null })); });
  expect(await screen.findByRole('heading', { name: 'No cards yet' })).toBeDefined();
  expect(screen.getByText(/even if you haven’t joined a circle/)).toBeDefined();
  expect(screen.getByRole('link', { name: 'Back to your circles' }).getAttribute('href')).toBe('/');
});

test('done-when-1: a failed cards load offers a retry that shows bank, type and optional variant', async () => {
  // Keep the real client and query lifecycle: a failed transport must not look like an empty list.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(Response.json({
    success: true,
    data: { items: [
      { id: 'credit-card', bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'credit', variant: 'Millennia' },
      { id: 'debit-card', bankId: 'federal-bank', bankName: 'Federal Bank', type: 'debit', variant: null },
    ], pagination: { page: 1, limit: 20, totalItems: 2, totalPages: 1 } }, error: null,
  })));
  await showCards();
  expect((await screen.findByRole('alert')).textContent).toContain('We couldn’t load your cards');
  expect(screen.getByText('Check your connection and try again.')).toBeDefined();
  expect(screen.queryByText('No cards yet')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  const list = await screen.findByRole('list', { name: 'Your cards' });
  const rows = within(list).getAllByRole('listitem');
  expect(rows).toHaveLength(2);
  expect(rows[0].textContent).toContain('HDFC Bank');
  expect(rows[0].textContent).toContain('Credit card');
  expect(rows[0].textContent).toContain('Millennia');
  expect(rows[1].textContent).toContain('Federal Bank');
  expect(rows[1].textContent).toContain('Debit card');
  expect(rows[1].textContent).not.toMatch(/null|undefined/);
  expect(screen.queryByRole('alert')).toBeNull();
});
