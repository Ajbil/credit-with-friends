import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { SignInPage } from './pages/sign-in-page';
import { OnboardingPage } from './pages/onboarding-page';
import { NotOpenYetPage } from './pages/not-open-yet-page';
import { ProfilePage } from './routes/profile/profile-page';
import { NoticePage } from './routes/notice/notice-page';
import { PrivacyPage } from './routes/notice/privacy-page';
import { SessionPage } from './routes/session/session-page';
import './style.css';

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: SignInPage });
const onboardingRoute = createRoute({ getParentRoute: () => rootRoute, path: '/onboarding', component: OnboardingPage });
const notOpenRoute = createRoute({ getParentRoute: () => rootRoute, path: '/not-open-yet', component: NotOpenYetPage });
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profile', component: ProfilePage });
const noticeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/notice', component: NoticePage });
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/privacy', component: PrivacyPage });
const sessionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/session', component: SessionPage });
const futureRoute = createRoute({ getParentRoute: () => rootRoute, path: '$', component: SignInPage });
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, onboardingRoute, notOpenRoute, profileRoute, noticeRoute, privacyRoute, sessionRoute, futureRoute]) });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
