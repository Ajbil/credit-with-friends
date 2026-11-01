import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { SearchPage } from './search-page';

afterEach(() => { cleanup(); history.replaceState(null, '', '/'); vi.unstubAllGlobals(); });

// Audit: protects an in-flight search from double submission and edits that would
// mislabel its response. A delayed connection makes that regression credible.
// Browser tests own completed searches; this test owns the pending lifecycle.
// Fetch is the existing transport boundary; no production-only seam is needed.
test('a pending search keeps its submitted fields and prevents a second request', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  let finishSearch!: (value: Response) => void;
  const pendingSearch = new Promise<Response>((resolve) => { finishSearch = resolve; });
  const fetch = vi.fn((_url: URL, options?: RequestInit) => options?.method === 'POST' ? pendingSearch : Promise.resolve(new Response(JSON.stringify({
    success: true, data: { items: [{ id: 'axis-bank', displayName: 'Axis Bank' }], contactEmail: 'owner@example.in' }, error: null,
  }))));
  vi.stubGlobal('fetch', fetch);
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: '/search', component: SearchPage });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/search'] }) });
  await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>); });
  const bank = await screen.findByLabelText('Bank or brand card');
  fireEvent.change(bank, { target: { value: 'axis-bank' } });
  fireEvent.change(screen.getByLabelText('Variant (optional)'), { target: { value: 'Flipkart' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Searching…' }).hasAttribute('disabled')).toBe(true));
  expect(bank.hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('Variant (optional)').hasAttribute('readonly')).toBe(true);
  expect(screen.getAllByRole('radio').every((radio) => radio.hasAttribute('disabled'))).toBe(true);
  fireEvent.submit(screen.getByRole('form', { name: 'Find a card' }));
  expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  await act(async () => { finishSearch(new Response(JSON.stringify({ success: true, data: { items: [], pagination: { page: 1, limit: 100, totalItems: 0, totalPages: 0 } }, error: null }))); });
  expect(await screen.findByText('No one in your circles has this card yet.')).toBeDefined();
});
