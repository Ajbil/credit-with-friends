import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../../api/fetcher';
import { NoticePage } from './notice-page';

const { notice, accept } = vi.hoisted(() => ({ notice: vi.fn(), accept: vi.fn() }));
vi.mock('../../api/generated', () => ({ accountsControllerNotice: notice }));
vi.mock('../../api/fetcher', async (original) => ({ ...await original(), apiFetch: accept }));
afterEach(() => { cleanup(); notice.mockReset(); accept.mockReset(); });

test('notice acceptance requires an explicit choice after the current text loads', async () => {
  notice.mockResolvedValue({ data: { data: { version: 2, text: 'A changed privacy notice.' } } });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NoticePage /></QueryClientProvider>);
  await screen.findByText('A changed privacy notice.');
  const button = screen.getByRole('button', { name: 'Accept and continue' });
  expect(button).toHaveProperty('disabled', true);
  expect(accept).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('I agree to the privacy notice.'));
  expect(button).toHaveProperty('disabled', false);
});

test('an expired session during notice acceptance shows sign-in and clears member data', async () => {
  notice.mockResolvedValue({ data: { data: { version: 2, text: 'A changed privacy notice.' } } });
  accept.mockRejectedValue(new ApiError(401, { code: 'UNAUTHORIZED', message: 'Please sign in again.' }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(['member'], { googleEmail: 'private@example.in' });
  render(<QueryClientProvider client={client}><NoticePage /></QueryClientProvider>);
  await screen.findByText('A changed privacy notice.');
  fireEvent.click(screen.getByLabelText('I agree to the privacy notice.'));
  fireEvent.click(screen.getByRole('button', { name: 'Accept and continue' }));
  await screen.findByRole('heading', { name: 'Your sign-in has ended' });
  await waitFor(() => expect(client.getQueryData(['member'])).toBeUndefined());
});
