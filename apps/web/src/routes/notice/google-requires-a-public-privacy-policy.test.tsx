import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrivacyPage } from './privacy-page';

const { notice } = vi.hoisted(() => ({ notice: vi.fn() }));
vi.mock('../../api/generated', () => ({ accountsControllerNotice: notice }));
afterEach(() => { cleanup(); notice.mockReset(); });

test('public privacy page shows the notice, a loading state, and a useful error', async () => {
  let complete: ((value: { data: { data: { version: number; text: string } } }) => void) | undefined;
  notice.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><PrivacyPage /></QueryClientProvider>);
  expect(screen.getByRole('status').textContent).toContain('Loading the privacy notice');
  complete?.({ data: { data: { version: 1, text: 'Current public notice. Contact owner@example.in.' } } });
  expect(await screen.findByText('Current public notice. Contact owner@example.in.')).toBeDefined();
  view.unmount();

  notice.mockRejectedValueOnce(new Error('offline'));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PrivacyPage /></QueryClientProvider>);
  expect(await screen.findByRole('heading', { name: "We couldn't load the privacy notice" })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
});
