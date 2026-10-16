import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CircleAdminSettings } from './circle-admin-settings';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const circle = { id: 'e4ac7e6a-97ca-4860-80fa-2823ad33b1c9', name: 'Family', members: [
  { id: 'admin-id', displayName: 'Asha Admin', isAdmin: true },
  { id: 'member-id', displayName: 'Dev Member', isAdmin: false },
] };

// Browser tests own the successful real-API flows. Here a held transport exposes
// the pending window and a server field error that client validation cannot reach.
test('done-when-4: rename sends one trimmed request and places API validation beside the name', async () => {
  let respond: (response: Response) => void = () => { throw new Error('No rename started'); };
  const fetch = vi.fn<(url: URL, options?: RequestInit) => Promise<Response>>(() => new Promise<Response>((resolve) => { respond = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient();
  try {
    render(<QueryClientProvider client={client}><CircleAdminSettings circle={circle} /></QueryClientProvider>);
    const input = screen.getByRole('textbox', { name: 'Circle name' });
    fireEvent.change(input, { target: { value: '  College friends  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename circle' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true));
    fireEvent.submit(input.closest('form')!);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].pathname).toBe(`/api/v1/circles/${circle.id}`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', credentials: 'include', body: JSON.stringify({ name: 'College friends' }), headers: { 'X-Requested-With': 'cwf' } });
    await act(async () => { respond(new Response(JSON.stringify({ success: false, data: null, error: {
      code: 'VALIDATION_ERROR', message: 'Check your input.', details: { fieldErrors: [{ field: 'name', reason: 'Use 1 to 40 characters.' }] },
    } }), { status: 400 })); });
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('Use 1 to 40 characters.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(error.id);
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('button', { name: 'Rename circle' }).hasAttribute('disabled')).toBe(false);
  } finally { client.clear(); }
});

test('done-when-4: a pending handover sends once and a departed target gives a useful recovery message', async () => {
  let respond: (response: Response) => void = () => { throw new Error('No handover started'); };
  const fetch = vi.fn<(url: URL, options?: RequestInit) => Promise<Response>>(() => new Promise<Response>((resolve) => { respond = resolve; }));
  vi.stubGlobal('fetch', fetch);
  const confirm = vi.fn().mockReturnValue(true);
  vi.stubGlobal('confirm', confirm);
  const client = new QueryClient();
  try {
    render(<QueryClientProvider client={client}><CircleAdminSettings circle={circle} /></QueryClientProvider>);
    fireEvent.change(screen.getByRole('combobox', { name: 'New admin' }), { target: { value: 'member-id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hand over admin role' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Handing over…' }).hasAttribute('disabled')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Handing over…' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toContain('Dev Member');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].pathname).toBe(`/api/v1/circles/${circle.id}/handover`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'POST', credentials: 'include', body: JSON.stringify({ memberId: 'member-id' }), headers: { 'X-Requested-With': 'cwf' } });
    await act(async () => { respond(new Response(JSON.stringify({ success: false, data: null, error: { code: 'HANDOVER_MEMBER_NOT_FOUND', message: 'Member unavailable.' } }), { status: 404 })); });
    expect((await screen.findByRole('alert')).textContent).toContain('Reload the circle and choose another member.');
    expect(screen.getByRole('button', { name: 'Hand over admin role' }).hasAttribute('disabled')).toBe(false);
    confirm.mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Hand over admin role' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { client.clear(); }
});

test('done-when-5: deletion warns before sending, blocks repeat submissions and requires a fresh confirmation after a network failure', async () => {
  let rejectDelete: (error: Error) => void = () => { throw new Error('No deletion started'); };
  const fetch = vi.fn<(url: URL, options?: RequestInit) => Promise<Response>>(() => new Promise<Response>((_resolve, reject) => { rejectDelete = reject; }));
  vi.stubGlobal('fetch', fetch);
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal('confirm', confirm);
  const client = new QueryClient();
  try {
    render(<QueryClientProvider client={client}><CircleAdminSettings circle={circle} /></QueryClientProvider>);
    const remove = screen.getByRole('button', { name: 'Delete circle' });
    fireEvent.click(remove);
    expect(confirm.mock.calls[0][0]).toMatch(/Family/);
    expect(confirm.mock.calls[0][0]).toMatch(/permanent.*cannot be undone/i);
    expect(fetch).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(remove);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Deleting…' }).hasAttribute('disabled')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Deleting…' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0].pathname).toBe(`/api/v1/circles/${circle.id}`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'DELETE', credentials: 'include', headers: { 'X-Requested-With': 'cwf' } });
    await act(async () => { rejectDelete(new TypeError('Failed to fetch')); });
    expect((await screen.findByRole('alert')).textContent).toContain('Check your connection and try again.');
    const retry = screen.getByRole('button', { name: 'Delete circle' });
    expect(retry.hasAttribute('disabled')).toBe(false);
    confirm.mockReturnValue(false);
    fireEvent.click(retry);
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { client.clear(); }
});
