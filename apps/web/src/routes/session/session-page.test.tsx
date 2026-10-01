import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionPage } from './session-page';

test('an ended session offers a labelled Google sign-in path', () => {
  render(<QueryClientProvider client={new QueryClient()}><SessionPage /></QueryClientProvider>);
  expect(screen.getByRole('heading', { name: 'Your sign-in has ended' })).toBeDefined();
  expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveProperty('href', expect.stringContaining('/auth/google/start'));
});
