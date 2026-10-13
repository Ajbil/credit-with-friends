import { expect, test } from 'vitest';
import { whatsappInviteUrl } from './invite-share.helper';

// These names exercise URL delimiters and Unicode beyond the browser flow's ordinary name.
test.each([
  ['College batch', 'Join my College batch circle on CreditWithFriends: https://creditwithfriends.in/circles/join/abc_123-DEF'],
  ['Family & friends + neighbours', 'Join my Family & friends + neighbours circle on CreditWithFriends: https://creditwithfriends.in/circles/join/abc_123-DEF'],
  ['Office #1? 50%', 'Join my Office #1? 50% circle on CreditWithFriends: https://creditwithfriends.in/circles/join/abc_123-DEF'],
  ['दोस्त 👋', 'Join my दोस्त 👋 circle on CreditWithFriends: https://creditwithfriends.in/circles/join/abc_123-DEF'],
])('done-when-2: WhatsApp preserves the circle name %j and the exact invite link', (name, message) => {
  const share = new URL(whatsappInviteUrl(name, 'https://creditwithfriends.in/circles/join/abc_123-DEF'));
  expect(share.origin + share.pathname).toBe('https://wa.me/');
  expect([...share.searchParams.keys()]).toEqual(['text']);
  expect(share.searchParams.get('text')).toBe(message);
});
