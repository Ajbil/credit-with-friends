import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NotOpenYetPage } from './not-open-yet-page';

afterEach(cleanup);

test('not-open-yet page explains how to join and offers a way home', () => {
  render(<NotOpenYetPage />);
  expect(screen.getByRole('heading', { name: 'Not open yet' })).toBeDefined();
  expect(screen.getByText('CreditWithFriends is still being set up for a small group. Ask the person who invited you when you can join.')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
});
