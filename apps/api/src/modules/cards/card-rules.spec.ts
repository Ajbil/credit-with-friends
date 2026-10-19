import { describe, expect, test } from 'vitest';
import { applyCardRules } from './card-rules.helper';

const banks = new Set(['hdfc-bank', 'axis-bank', 'kotak-mahindra-bank']);
const listed = [{ id: 'card-1', bankId: 'hdfc-bank', type: 'credit', variantKey: 'millennia' }];

function refusal(input: { bankId?: unknown; type?: unknown; variant?: unknown }, cards = listed) {
  try {
    applyCardRules(input, banks, cards);
  } catch (error) {
    return error as { getResponse(): unknown; getStatus(): number };
  }
  throw new Error('Expected a refusal');
}

describe('card rules shared by add and edit', () => {
  test.each([undefined, null, '', 1, 'HDFC Bank'])('malformed bank %s is invalid input', (bankId) => {
    expect(refusal({ bankId, type: 'credit' }).getStatus()).toBe(400);
    expect(refusal({ bankId, type: 'credit' }).getResponse()).toMatchObject({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'bankId' }] } });
  });

  test('a well-formed bank absent from the list is refused', () => {
    expect(refusal({ bankId: 'missing-bank', type: 'credit' }).getResponse()).toMatchObject({ code: 'CARD_BANK_UNKNOWN', details: { fieldErrors: [{ field: 'bankId', reason: 'Choose a bank from the list.' }] } });
  });

  test.each([undefined, null, '', 'charge', 1])('invalid card type %s is refused', (type) => {
    expect(refusal({ bankId: 'hdfc-bank', type }).getResponse()).toMatchObject({ code: 'VALIDATION_ERROR', details: { fieldErrors: [{ field: 'type' }] } });
  });

  test.each(['123', '12 34', '1-2-3', '1/2/3', '1 - 2 / 3'])('card-like variant %s is refused', (variant) => {
    expect(refusal({ bankId: 'hdfc-bank', type: 'credit', variant }).getResponse()).toMatchObject({ code: 'CARD_VARIANT_UNSAFE', details: { fieldErrors: [{ field: 'variant', reason: 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.' }] } });
  });

  test.each(['Kotak 811', '811 Dream Different'])('allows standalone card-product number in %s', (variant) => {
    expect(applyCardRules({ bankId: 'kotak-mahindra-bank', type: 'credit', variant }, banks, listed).variant).toBe(variant);
  });

  test.each(['Card number: 811', 'CVV 811', '811 cvv', 'OTP 811', 'Exp 811', 'PIN: 811', 'CVC 811', 'expiry 811', '811 no'])('refuses card-detail words beside product number in %s', (variant) => {
    expect(refusal({ bankId: 'kotak-mahindra-bank', type: 'credit', variant }).getResponse()).toMatchObject({ code: 'CARD_VARIANT_UNSAFE', details: { fieldErrors: [{ field: 'variant', reason: 'This looks like card details. Never enter card numbers, CVVs, expiry dates or OTPs.' }] } });
  });

  test('card-detail words must stand alone to disable a product number', () => {
    expect(applyCardRules({ bankId: 'kotak-mahindra-bank', type: 'credit', variant: 'CVVPlus 811' }, banks, listed).variant).toBe('CVVPlus 811');
  });

  test.each(['811', 'Kotak 811'])('refuses product number on another bank in %s', (variant) => {
    expect(refusal({ bankId: 'hdfc-bank', type: 'credit', variant }).getResponse()).toMatchObject({ code: 'CARD_VARIANT_UNSAFE' });
  });

  test.each(['8110', '811 123', '811-4567', '123 811', '811/811'])('refuses product number joined to other digits in %s', (variant) => {
    expect(refusal({ bankId: 'kotak-mahindra-bank', type: 'credit', variant }).getResponse()).toMatchObject({ code: 'CARD_VARIANT_UNSAFE' });
  });

  test.each(['811–123', '811\u00a0123', '1–2–3', '1\u00a02\u00a03'])('refuses card-like digits separated by typographic spaces or dashes in %s', (variant) => {
    expect(refusal({ bankId: 'kotak-mahindra-bank', type: 'credit', variant }).getResponse()).toMatchObject({ code: 'CARD_VARIANT_UNSAFE' });
  });

  test('a variant over 40 characters after trimming is refused', () => {
    expect(refusal({ bankId: 'hdfc-bank', type: 'credit', variant: ` ${'a'.repeat(41)} ` }).getResponse()).toMatchObject({ code: 'CARD_VARIANT_TOO_LONG', details: { fieldErrors: [{ field: 'variant', reason: 'Use at most 40 characters.' }] } });
  });

  test('normalizes optional variants and accepts ordinary digits in names', () => {
    expect(applyCardRules({ bankId: 'axis-bank', type: 'debit' }, banks, listed)).toEqual({ bankId: 'axis-bank', type: 'debit', variant: null, variantKey: '' });
    expect(applyCardRules({ bankId: 'axis-bank', type: 'credit', variant: '  Regalia 2.0  ' }, banks, listed)).toMatchObject({ variant: 'Regalia 2.0', variantKey: 'regalia 2.0' });
    expect(applyCardRules({ bankId: 'axis-bank', type: 'credit', variant: '2 Gold' }, banks, listed).variantKey).toBe('2 gold');
  });

  test('duplicate comparison ignores case and outer spaces, while editing self and other variants are allowed', () => {
    expect(refusal({ bankId: 'hdfc-bank', type: 'credit', variant: ' MILLENNIA ' }).getResponse()).toMatchObject({ code: 'CARD_DUPLICATE' });
    expect(applyCardRules({ bankId: 'hdfc-bank', type: 'credit', variant: ' MILLENNIA ' }, banks, listed, 'card-1').variantKey).toBe('millennia');
    expect(applyCardRules({ bankId: 'hdfc-bank', type: 'credit', variant: 'Regalia' }, banks, listed).variantKey).toBe('regalia');
    const empty = [{ id: 'empty', bankId: 'axis-bank', type: 'debit', variantKey: '' }];
    expect(refusal({ bankId: 'axis-bank', type: 'debit', variant: ' ' }, empty).getResponse()).toMatchObject({ code: 'CARD_DUPLICATE' });
  });

  test('a 21st new card is refused while an edit is permitted', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => ({ id: `card-${index}`, bankId: 'hdfc-bank', type: 'credit', variantKey: `variant-${index}` }));
    expect(refusal({ bankId: 'axis-bank', type: 'debit' }, twenty).getResponse()).toMatchObject({ code: 'CARD_LIMIT' });
    expect(applyCardRules({ bankId: 'axis-bank', type: 'debit' }, banks, twenty, 'card-0').type).toBe('debit');
  });

  test('editing into another owned card is a duplicate but keeping its own identity is allowed', () => {
    const cards = [
      { id: 'first', bankId: 'hdfc-bank', type: 'credit', variantKey: 'millennia' },
      { id: 'second', bankId: 'axis-bank', type: 'credit', variantKey: 'neo' },
    ];
    try {
      applyCardRules({ bankId: 'axis-bank', type: 'credit', variant: ' NEO ' }, banks, cards, 'first');
      throw new Error('Expected duplicate refusal');
    } catch (error) {
      expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({ code: 'CARD_DUPLICATE' });
    }
    expect(applyCardRules({ bankId: 'hdfc-bank', type: 'credit', variant: 'Millennia' }, banks, cards, 'first').variantKey).toBe('millennia');
  });
});
