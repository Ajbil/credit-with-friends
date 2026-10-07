import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { SignInPage } from './sign-in-page';

const { me, listCircles } = vi.hoisted(() => ({ me: vi.fn(), listCircles: vi.fn() }));
vi.mock('../api/generated', () => ({ accountsControllerMe: me, accountsControllerPending: vi.fn(), listCirclesControllerList: listCircles, createCircleControllerCreate: vi.fn() }));

afterEach(() => { cleanup(); me.mockReset(); listCircles.mockReset(); vi.unstubAllGlobals(); });

test('the signed-in home page links to the profile route', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  me.mockResolvedValue({ data: { data: { displayName: 'Phone Member' } } });
  // The signed-in home now loads circles as well as the member account.
  listCircles.mockResolvedValue({ data: { data: { items: [], pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } } } });
  const root = createRootRoute();
  const home = createRoute({ getParentRoute: () => root, path: '/', component: SignInPage });
  const profile = createRoute({ getParentRoute: () => root, path: '/profile', component: () => <h1>Your profile</h1> });
  const router = createRouter({ routeTree: root.addChildren([home, profile]), history: createMemoryHistory({ initialEntries: ['/'] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>); });
  expect((await screen.findByRole('link', { name: 'Your profile' })).getAttribute('href')).toBe('/profile');
});
