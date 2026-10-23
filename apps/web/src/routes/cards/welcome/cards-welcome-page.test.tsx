import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { CardsWelcomePage } from './cards-welcome-page';

afterEach(() => { cleanup(); history.replaceState(null, '', '/'); vi.unstubAllGlobals(); });

// Browser tests own onboarding and invite consumption. These cases guard the separate
// URL trust boundary: a manually changed welcome link must never send Skip off-site.
test.each([
  [null, '/', '/cards/add'],
  ['/circles/family', '/circles/family', '/cards/add?returnTo=%2Fcircles%2Ffamily'],
  ['https://example.org/steal', '/', '/cards/add'],
  ['//example.org/steal', '/', '/cards/add'],
  ['/\\example.org/steal', '/', '/cards/add'],
  ['/\t/example.org/steal', '/', '/cards/add'],
])('done-when-5: the invitation uses a safe internal destination (%s)', async (returnTo, skipPath, addPath) => {
  vi.stubGlobal('scrollTo', vi.fn());
  history.replaceState(null, '', `/cards/welcome${returnTo === null ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`);
  const root = createRootRoute();
  const welcome = createRoute({ getParentRoute: () => root, path: '/cards/welcome', component: CardsWelcomePage });
  const router = createRouter({ routeTree: root.addChildren([welcome]), history: createMemoryHistory({ initialEntries: [location.pathname + location.search] }) });
  await act(async () => { render(<RouterProvider router={router} />); });
  expect(screen.getByRole('heading', { name: 'Add your cards' })).toBeDefined();
  expect(screen.getByText('We never ask for card numbers, CVV, expiry dates or OTPs, and your cards are never shared outside your circles.').tagName).toBe('STRONG');
  expect(screen.getByRole('link', { name: 'Skip for now' }).getAttribute('href')).toBe(skipPath);
  expect(screen.getByRole('link', { name: 'Add a card' }).getAttribute('href')).toBe(addPath);
});
