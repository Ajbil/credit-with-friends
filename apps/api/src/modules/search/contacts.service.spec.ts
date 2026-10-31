import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { articleForBank } from './contacts.service';

const migration = 'prisma/migrations/20261018000000_cards_banks/migration.sql';
const fromApi = resolve(process.cwd(), migration);
const bankSeed = readFileSync(existsSync(fromApi) ? fromApi : resolve(process.cwd(), 'apps/api', migration), 'utf8');
const names = [...bankSeed.matchAll(/\('([^']+)', '([^']+)', '[^']+', CURRENT_TIMESTAMP\)/g)]
  .map(([, id, displayName]) => ({ id, displayName }));
const AN_BANKS = new Set([
  'airtel-payments-bank', 'american-express', 'au-small-finance-bank', 'axis-bank',
  'equitas-small-finance-bank', 'esaf-small-finance-bank',
  'hdfc-bank', 'hsbc', 'icici-bank', 'idbi-bank', 'idfc-first-bank',
  'india-post-payments-bank', 'indian-bank', 'indian-overseas-bank', 'indusind-bank',
  'nsdl-payments-bank', 'rbl-bank', 'sbm-bank-india', 'svc-co-operative-bank',
  'uco-bank', 'ujjivan-small-finance-bank', 'union-bank-of-india',
  'unity-small-finance-bank', 'utkarsh-small-finance-bank',
]);

describe('bank article in the WhatsApp message', () => {
  test('covers every seeded bank', () => expect(names).toHaveLength(57));
  test.each(names)('$displayName uses its spoken article', ({ id, displayName }) => {
    expect(articleForBank(displayName)).toBe(AN_BANKS.has(id) ? 'an' : 'a');
  });
});
