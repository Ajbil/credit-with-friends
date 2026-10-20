import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { EditCardPage } from './edit-card-page';

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

test('done-when-3: a cache refresh preserves a draft and changing edit URLs loads the selected card', async () => {
  // Browser tests own persistence and refusals. This guards the router/query
  // lifecycle: refreshing server data must not overwrite an unsaved draft or
  // carry that draft into a different card's edit screen.
  vi.stubGlobal('scrollTo', vi.fn());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: '/cards/$cardId/edit', component: EditCardPage });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/cards/first/edit'] }) });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(client);
  client.setQueryData(['banks'], { items: [{ id: 'hdfc-bank', displayName: 'HDFC Bank' }, { id: 'federal-bank', displayName: 'Federal Bank' }], contactEmail: 'support@example.in' });
  const cards = { items: [
    { id: 'first', bankId: 'hdfc-bank', bankName: 'HDFC Bank', type: 'credit', variant: 'Millennia' },
    { id: 'second', bankId: 'federal-bank', bankName: 'Federal Bank', type: 'debit', variant: null },
  ] };
  client.setQueryData(['my-cards'], cards);
  await act(async () => { render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); });
  const variant = screen.getByRole<HTMLInputElement>('textbox', { name: 'Variant (optional)' });
  fireEvent.change(variant, { target: { value: 'My draft' } });
  await act(async () => { client.setQueryData(['my-cards'], { items: [...cards.items].reverse() }); });
  expect(variant.value).toBe('My draft');
  await act(async () => { await router.navigate({ to: '/cards/$cardId/edit', params: { cardId: 'second' } }); });
  expect(window.confirm).toHaveBeenCalledWith('Leave without saving this card?');
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Bank' }).value).toBe('federal-bank');
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Card type' }).value).toBe('debit');
  expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Variant (optional)' }).value).toBe('');
});
