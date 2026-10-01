import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../../api/fetcher';
import { ProfilePage } from './profile-page';

const { me, signOut, update } = vi.hoisted(() => ({ me: vi.fn(), signOut: vi.fn(), update: vi.fn() }));
vi.mock('../../api/generated', () => ({ accountsControllerMe: me, sessionsControllerSignOut: signOut }));
vi.mock('../../api/fetcher', async (original) => ({ ...await original(), apiFetch: update }));

const initial = { id: 'member-one', displayName: 'Initial Name', whatsappE164: '+919876543210', googleEmail: 'first@example.in', googleAccountId: 'google-one' };
afterEach(() => { cleanup(); me.mockReset(); signOut.mockReset(); update.mockReset(); });

function showProfile() {
  me.mockResolvedValue({ data: { data: initial } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ProfilePage /></QueryClientProvider>);
  return client;
}

test('profile rejects invalid edits and keeps the saved values until a valid edit succeeds', async () => {
  showProfile();
  await screen.findByText('first@example.in');
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByText('Use 1 to 50 characters.')).toBeDefined();
  expect(update).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } });
  fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(screen.getByText('Enter a valid phone number with a country code.')).toBeDefined();
  expect(update).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '+447911123456' } });
  update.mockResolvedValue({ data: { data: { ...initial, displayName: 'New Name', whatsappE164: '+447911123456' } } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Your changes are saved.');
  expect(screen.getByLabelText('Name')).toHaveProperty('value', 'New Name');
  expect(screen.getByLabelText('WhatsApp number')).toHaveProperty('value', '+447911123456');
});

test('an invalid session during sign-out hides private profile data and clears the cache', async () => {
  const client = showProfile();
  await screen.findByText('first@example.in');
  me.mockRejectedValue(new ApiError(401, { code: 'UNAUTHORIZED', message: 'Please sign in again.' }));
  signOut.mockRejectedValue(new ApiError(401, { code: 'UNAUTHORIZED', message: 'Please sign in again.' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign out of this device' }));
  await screen.findByRole('heading', { name: 'Your sign-in has ended' });
  expect(screen.queryByText('first@example.in')).toBeNull();
  await waitFor(() => expect(client.getQueryData(['member'])).toBeUndefined());
});
