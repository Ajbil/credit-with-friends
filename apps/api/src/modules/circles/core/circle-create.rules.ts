import { randomBytes } from 'node:crypto';

const circleNameSegments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function normalizeCircleName(value: string): string | null {
  const name = value.trim();
  const length = Array.from(circleNameSegments.segment(name)).length;
  return length >= 1 && length <= 40 ? name : null;
}

export function isOwnerCreated(creatorGoogleAccountId: string, configuredOwnerGoogleAccountId?: string): boolean {
  return Boolean(configuredOwnerGoogleAccountId && creatorGoogleAccountId === configuredOwnerGoogleAccountId);
}

export function createInviteCode(): string {
  return randomBytes(16).toString('base64url');
}
