import { describe, expect, test } from 'vitest';
import { createInviteCode, isOwnerCreated, normalizeCircleName } from './circle-create.rules';

describe('circle creation rules', () => {
  test('trims names and accepts 1 to 40 visible characters, including emoji', () => {
    expect(normalizeCircleName('  Family  ')).toBe('Family');
    expect(normalizeCircleName(' ')).toBeNull();
    expect(normalizeCircleName('😀'.repeat(40))).toBe('😀'.repeat(40));
    expect(normalizeCircleName('😀'.repeat(41))).toBeNull();
    expect(normalizeCircleName('👨‍👩‍👧‍👦'.repeat(40))).toBe('👨‍👩‍👧‍👦'.repeat(40));
    expect(normalizeCircleName('x'.repeat(41))).toBeNull();
  });

  test('records owner creation only for the configured Google account ID', () => {
    expect(isOwnerCreated('google-owner', 'google-owner')).toBe(true);
    expect(isOwnerCreated('google-other', 'google-owner')).toBe(false);
    expect(isOwnerCreated('google-owner', undefined)).toBe(false);
    expect(isOwnerCreated('google-owner', '')).toBe(false);
  });

  test('creates distinct 128-bit base64url invite codes', () => {
    const first = createInviteCode();
    const second = createInviteCode();
    expect(first).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(first).not.toBe(second);
  });
});
