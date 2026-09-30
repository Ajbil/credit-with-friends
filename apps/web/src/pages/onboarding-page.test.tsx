import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnboardingPage } from './onboarding-page';

const { onboard } = vi.hoisted(() => ({ onboard: vi.fn() }));
vi.mock('../api/generated', () => ({
  accountsControllerPending: () => Promise.resolve({ data: { data: { name: 'Listed Person', email: 'listed@example.in', returnPath: '/' } } }),
  accountsControllerNotice: () => Promise.resolve({ data: { data: { version: 1, text: 'Test notice.' } } }),
  accountsControllerOnboard: onboard,
  accountsControllerCancel: vi.fn(),
}));

afterEach(() => { cleanup(); onboard.mockReset(); });

test('onboarding form rejects invalid details and missing consent before sending them', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OnboardingPage /></QueryClientProvider>);
  await screen.findByText('Test notice.');
  const name = screen.getByLabelText('Name');
  const phone = screen.getByLabelText('WhatsApp number');
  const create = screen.getByRole('button', { name: 'Create my account' });

  fireEvent.change(name, { target: { value: '' } });
  fireEvent.change(phone, { target: { value: '+447911123456' } });
  fireEvent.click(create);
  expect(screen.getByText('Use 1 to 50 characters.')).toBeDefined();
  expect(onboard).not.toHaveBeenCalled();

  fireEvent.change(name, { target: { value: 'x'.repeat(51) } });
  fireEvent.click(create);
  expect(screen.getByText('Use 1 to 50 characters.')).toBeDefined();
  expect(onboard).not.toHaveBeenCalled();

  fireEvent.change(name, { target: { value: 'Listed Person' } });
  fireEvent.change(phone, { target: { value: '12' } });
  fireEvent.click(create);
  expect(screen.getByText('Enter a valid phone number with a country code.')).toBeDefined();
  expect(onboard).not.toHaveBeenCalled();

  fireEvent.change(phone, { target: { value: '+447911123456' } });
  fireEvent.click(create);
  expect(screen.getByText('Confirm you are 18 or older.')).toBeDefined();
  expect(screen.getByText('Accept the privacy notice to continue.')).toBeDefined();
  expect(onboard).not.toHaveBeenCalled();
});
