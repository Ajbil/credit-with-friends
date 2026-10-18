import { BadRequestException, ConflictException } from '@nestjs/common';

type CardInput = { bankId?: unknown; type?: unknown; variant?: unknown };
type ExistingCard = { id: string; bankId: string; type: string; variantKey: string };

export const ALLOWED_CARD_PRODUCT_NUMBERS: readonly string[] = ['811'];
export const CARD_DETAILS_WORDS: readonly string[] = ['cvv', 'cvc', 'otp', 'pin', 'expiry', 'exp'];

function fieldRefusal(code: string, field: string, reason: string): never {
  throw new BadRequestException({ code, details: { fieldErrors: [{ field, reason }] } });
}

// Call under the member-row lock for adds. The unique database key is the final race guard.
export function applyCardRules(input: CardInput, banks: ReadonlySet<string>, cards: ReadonlyArray<ExistingCard>, editingCardId?: string) {
  const { bankId, type } = input;
  if (typeof bankId !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(bankId)) {
    fieldRefusal('VALIDATION_ERROR', 'bankId', 'Choose a bank from the list.');
  }
  if (!banks.has(bankId)) fieldRefusal('CARD_BANK_UNKNOWN', 'bankId', 'Choose a bank from the list.');
  if (type !== 'credit' && type !== 'debit') fieldRefusal('VALIDATION_ERROR', 'type', 'Choose credit or debit.');
  if (input.variant !== undefined && input.variant !== null && typeof input.variant !== 'string') {
    fieldRefusal('VALIDATION_ERROR', 'variant', 'Enter a card variant or leave it blank.');
  }
  const variant = typeof input.variant === 'string' ? input.variant.trim() : '';
  const hasCardDetailsWord = variant.split(/[^\p{L}\p{N}\p{M}_]+/u).some((word) => CARD_DETAILS_WORDS.includes(word.toLowerCase()));
  const checkedVariant = variant.replace(/\p{Nd}+/gu, (digits, offset: number) => {
    if (hasCardDetailsWord || !ALLOWED_CARD_PRODUCT_NUMBERS.includes(digits)) return digits;
    const before = variant.slice(0, offset);
    const after = variant.slice(offset + digits.length);
    const touchesWord = /[\p{L}\p{N}\p{M}_]$/u.test(before) || /^[\p{L}\p{N}\p{M}_]/u.test(after);
    const joinsDigits = /\p{Nd}[\s\p{Pd}/]*$/u.test(before) || /^[\s\p{Pd}/]*\p{Nd}/u.test(after);
    return touchesWord || joinsDigits ? digits : '';
  });
  if (/\p{Nd}(?:[\s\p{Pd}/]*\p{Nd}){2}/u.test(checkedVariant)) {
    fieldRefusal('CARD_VARIANT_UNSAFE', 'variant', 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.');
  }
  if (Array.from(variant).length > 40) fieldRefusal('CARD_VARIANT_TOO_LONG', 'variant', 'Use at most 40 characters.');
  const variantKey = variant.toLowerCase();
  if (cards.some((card) => card.id !== editingCardId && card.bankId === bankId && card.type === type && card.variantKey === variantKey)) {
    throw new ConflictException({ code: 'CARD_DUPLICATE' });
  }
  if (editingCardId === undefined && cards.length >= 20) throw new ConflictException({ code: 'CARD_LIMIT' });
  return { bankId, type, variant: variant || null, variantKey };
}
