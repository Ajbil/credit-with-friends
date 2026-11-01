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

// Audit: a timed-out contact must let the member retry without losing results.
// Browser tests own aborted/server failures; a transport that only rejects when
// its signal expires covers the bounded wait without a slow browser sleep.
// It uses fetch and the real AbortSignal, with no new production test seam.
test('a contact timeout keeps search results and enables another press', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  history.replaceState({ cwfCardSearch: {
    values: { pickerValue: 'axis-bank', bankId: 'axis-bank', type: 'any', variant: '' },
    criteria: { bankId: 'axis-bank', type: 'any' },
    data: { items: [{ memberId: 'holder', displayName: 'Meera', group: 'all', circles: [{ id: 'family', name: 'Family' }], cards: [
      { id: 'listed-card', bankId: 'axis-bank', bankName: 'Axis Bank', type: 'credit', variant: 'Flipkart' },
    ] }], pagination: { page: 1, limit: 100, totalItems: 1, totalPages: 1 } },
  } }, '', '/');
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', vi.fn((url: URL, options?: RequestInit) => {
    if (url.pathname === '/api/v1/contacts') {
      signal = options?.signal;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal?.reason), { once: true }));
    }
    return Promise.resolve(Response.json({ success: true, data: { items: [{ id: 'axis-bank', displayName: 'Axis Bank' }], contactEmail: 'owner@example.in' }, error: null }));
  }));
  // Only the timer's clock is shortened; the native signal still aborts fetch.
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(20));
  try {
    const root = createRootRoute();
    const route = createRoute({ getParentRoute: () => root, path: '/search', component: SearchPage });
    const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/search'] }) });
    await act(async () => { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>); });
    fireEvent.click(await screen.findByRole('button', { name: 'Message on WhatsApp' }));
    expect((await screen.findByRole('alert')).textContent).toBe("We couldn't open WhatsApp. Check your connection and try again.");
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole('button', { name: 'Message on WhatsApp' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('heading', { name: 'Meera' })).toBeDefined();
    expect(screen.getByText('Flipkart')).toBeDefined();
  } finally { timeoutSpy.mockRestore(); }
});
