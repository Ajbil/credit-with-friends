import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CircleClearRemovals, CircleMemberRemoval } from './circle-member-removal';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// The real browser flow owns removal and rejoining. These transport checks own
// double submission during a slow response and displaying API refusals verbatim.
test.each([
  { action: 'remove', label: 'Remove Dev Member', pending: 'Removing…', path: '/members/member-id/remove', message: "You're the admin. To step away, leave the circle instead." },
  { action: 'clear', label: 'Clear all removals', pending: 'Clearing…', path: '/removals/clear', message: 'You do not have permission to do this.' },
])('done-when-3: $action waits for confirmation, disables duplicate requests and shows the API refusal', async ({ action, label, pending, path, message }) => {
  let resolveRequest: (response: Response) => void = () => { throw new Error('No request started'); };
  const fetch = vi.fn<(url: URL, options?: RequestInit) => Promise<Response>>();
  fetch.mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('confirm', confirm);
  const client = new QueryClient();
  try {
    render(<QueryClientProvider client={client}>{action === 'remove'
      ? <CircleMemberRemoval circleId="circle-id" member={{ id: 'member-id', displayName: 'Dev Member', isAdmin: false }} />
      : <CircleClearRemovals circleId="circle-id" />}</QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(fetch).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(screen.getByRole('button', { name: action === 'remove' ? 'Remove Dev Member' : pending }).hasAttribute('disabled')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: action === 'remove' ? 'Remove Dev Member' : pending }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url.pathname).toBe(`/api/v1/circles/circle-id${path}`);
    expect(options).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'cwf' } });
    await act(async () => { resolveRequest(new Response(JSON.stringify({ success: false, data: null, error: { code: action === 'remove' ? 'ADMIN_CANNOT_REMOVE_SELF' : 'FORBIDDEN', message } }), { status: 403 })); });
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(screen.getByRole('button', { name: label }).hasAttribute('disabled')).toBe(false);
  } finally { client.clear(); }
});
