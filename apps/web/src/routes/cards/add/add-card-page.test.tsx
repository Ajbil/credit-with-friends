import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { AddCardPage } from './add-card-page';

const clients: QueryClient[] = [];

afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

test('done-when-1: each keyboard shortcut selection stays selected while its card details change', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  const root = createRootRoute();
  const route = createRoute({ getParentRoute: () => root, path: '/cards/add', component: AddCardPage });
  const router = createRouter({ routeTree: root.addChildren([route]), history: createMemoryHistory({ initialEntries: ['/cards/add'] }) });
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(client);
  client.setQueryData(['banks'], {
    items: [{ id: 'csb-bank', displayName: 'CSB Bank' }, { id: 'federal-bank', displayName: 'Federal Bank' }],
    contactEmail: 'support@example.in',
  });
  await act(async () => { render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); });
  const picker = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Bank' });
  fireEvent.change(picker, { target: { value: 'Scapia:federal-bank' } });
  picker.focus();
  for (const [label, value, type, variant] of [
    ['Jupiter Edge (CSB Bank)', 'Jupiter Edge:csb-bank', 'credit', 'Jupiter Edge'],
    ['Jupiter Edge (Federal Bank)', 'Jupiter Edge:federal-bank', 'credit', 'Jupiter Edge'],
    ['Jupiter debit card (Federal Bank)', 'Jupiter debit card:federal-bank', 'debit', 'Jupiter'],
  ]) {
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' });
    // JSDOM has no native select keyboard action. Deliver its resulting change;
    // Playwright separately proves that real ArrowDown events produce it.
    const next = picker.options[Math.min(picker.selectedIndex + 1, picker.options.length - 1)];
    fireEvent.change(picker, { target: { value: next.value } });
    expect(document.activeElement).toBe(picker);
    expect(picker.value).toBe(value);
    expect(picker.selectedOptions[0].textContent).toBe(label);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'Card type' }).value).toBe(type);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Variant (optional)' }).value).toBe(variant);
  }
  // Editing filled details must not replace the selected shortcut with its bank.
  fireEvent.change(screen.getByRole('textbox', { name: 'Variant (optional)' }), { target: { value: 'My Jupiter' } });
  expect(picker.value).toBe('Jupiter debit card:federal-bank');
  fireEvent.change(picker, { target: { value: 'csb-bank' } });
  expect(picker.selectedOptions[0].textContent).toBe('CSB Bank');
});
