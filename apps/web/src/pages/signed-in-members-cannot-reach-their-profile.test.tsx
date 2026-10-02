import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { SignInPage } from './sign-in-page';

const { me } = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('../api/generated', () => ({ accountsControllerMe: me, accountsControllerPending: vi.fn() }));
afterEach(() => { cleanup(); me.mockReset(); vi.unstubAllGlobals(); });

test('the signed-in home page links to the profile route', async () => {
  vi.stubGlobal('scrollTo', vi.fn());
  me.mockResolvedValue({ data: { data: { displayName: 'Phone Member' } } });
  const root = createRootRoute();
  const home = createRoute({ getParentRoute: () => root, path: '/', component: SignInPage });
  const profile = createRoute({ getParentRoute: () => root, path: '/profile', component: () => <h1>Your profile</h1> });
  const router = createRouter({ routeTree: root.addChildren([home, profile]), history: createMemoryHistory({ initialEntries: ['/'] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  expect((await screen.findByRole('link', { name: 'Your profile' })).getAttribute('href')).toBe('/profile');
});
