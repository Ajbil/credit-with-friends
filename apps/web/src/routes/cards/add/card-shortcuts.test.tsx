import { expect, test } from 'vitest';
import { CARD_SHORTCUTS } from './card-shortcuts';

// Independent release contract from docs/specs/cards.md, not a rendered snapshot.
// This catches a wrong issuer/type/variant that a successful save cannot detect.
const SPEC_SHORTCUTS = [
  ['OneCard', 'federal-bank', 'credit', 'OneCard'],
  ['OneCard', 'bank-of-baroda', 'credit', 'OneCard'],
  ['OneCard', 'csb-bank', 'credit', 'OneCard'],
  ['OneCard', 'sbm-bank-india', 'credit', 'OneCard'],
  ['OneCard', 'south-indian-bank', 'credit', 'OneCard'],
  ['OneCard', 'indian-bank', 'credit', 'OneCard'],
  ['Scapia', 'federal-bank', 'credit', 'Scapia'],
  ['Jupiter Edge', 'csb-bank', 'credit', 'Jupiter Edge'],
  ['Jupiter Edge', 'federal-bank', 'credit', 'Jupiter Edge'],
  ['Jupiter debit card', 'federal-bank', 'debit', 'Jupiter'],
  ['slice', 'slice-small-finance-bank', 'credit', 'slice'],
  ['Kiwi', 'yes-bank', 'credit', 'Kiwi'],
  ['Kiwi', 'punjab-national-bank', 'credit', 'Kiwi'],
  ['Kiwi KOSMO', 'au-small-finance-bank', 'credit', 'Kiwi KOSMO'],
  ['Tata Neu', 'hdfc-bank', 'credit', 'Tata Neu'],
  ['Tata Neu', 'state-bank-of-india', 'credit', 'Tata Neu'],
  ['Amazon Pay', 'icici-bank', 'credit', 'Amazon Pay'],
  ['Flipkart', 'state-bank-of-india', 'credit', 'Flipkart'],
  ['Flipkart', 'axis-bank', 'credit', 'Flipkart'],
  ['Swiggy', 'hdfc-bank', 'credit', 'Swiggy'],
  ['Airtel', 'axis-bank', 'credit', 'Airtel'],
  ['PhonePe', 'hdfc-bank', 'credit', 'PhonePe'],
  ['POP', 'yes-bank', 'credit', 'POP'],
  ['BharatPe', 'unity-small-finance-bank', 'credit', 'BharatPe'],
  ['superCard', 'axis-bank', 'credit', 'superCard'],
  ['superCard', 'kotak-mahindra-bank', 'credit', 'superCard'],
  ['superCard', 'utkarsh-small-finance-bank', 'credit', 'superCard'],
] as const;

test.each(SPEC_SHORTCUTS)('done-when-1: %s at %s is %s with variant %s', (brand, bankId, type, variant) => {
  expect(CARD_SHORTCUTS.find((shortcut) => shortcut.brand === brand && shortcut.bankId === bankId)).toEqual({ brand, bankId, type, variant });
});

test('done-when-1: the picker release contains exactly the 27 specified shortcuts', () => {
  expect(CARD_SHORTCUTS).toHaveLength(27);
});
