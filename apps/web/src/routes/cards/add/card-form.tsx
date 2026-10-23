import { useEffect, useRef, type FormEventHandler } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AddCardDto, BanksDataDto } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { Button } from '../../../components/ui/button';
import { CARD_SHORTCUTS } from './card-shortcuts';
import '../list/cards.css';
import './card-add.css';

export type CardValues = { pickerValue: string; bankId: string; type: AddCardDto['type']; variant: string };

export function CardReminder() {
  return <p className="card-reminder">Never enter card numbers, CVV, expiry dates or OTPs.</p>;
}

export function CardForm({ banks, values, onChange, onSubmit, saving, error, label, disabled = false }: {
  banks: UseQueryResult<BanksDataDto>;
  values: CardValues;
  onChange: (values: CardValues) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  saving: boolean;
  error: Error | null;
  label: string;
  disabled?: boolean;
}) {
  const ready = banks.isSuccess && banks.data.items.length > 0;
  const focusBankAfterRetry = useRef(false);
  const fieldErrors = error instanceof ApiError
    ? Object.fromEntries((error.failure.details?.fieldErrors ?? []).filter(({ field }) => ['bankId', 'type', 'variant'].includes(field)).map(({ field, reason }) => [field, reason]))
    : {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;
  const bankNames = new Map(banks.data?.items.map((bank) => [bank.id, bank.displayName]));

  useEffect(() => {
    if (ready && focusBankAfterRetry.current) {
      document.getElementById('card-bank')?.focus();
      focusBankAfterRetry.current = false;
    }
  }, [ready]);
  useEffect(() => {
    if (!error) return;
    const field = error instanceof ApiError ? error.failure.details?.fieldErrors?.[0]?.field : undefined;
    document.getElementById(field === 'bankId' ? 'card-bank' : field === 'type' ? 'card-type' : field === 'variant' ? 'card-variant' : 'card-save-error')?.focus();
  }, [error]);

  return <>
    <form className="card-add-form" onSubmit={onSubmit} noValidate aria-label={label}>
      {banks.isPending ? <p role="status">Loading banks…</p> : !ready ? <div className="cards-state" role="alert">
        <h2>We couldn’t load the banks</h2><p>Check your connection and try again.</p>
        <Button type="button" variant="quiet" disabled={banks.isFetching} onClick={() => { focusBankAfterRetry.current = true; banks.refetch(); }}>{banks.isFetching ? 'Trying again…' : 'Try again'}</Button>
      </div> : <>
        <div className="card-add-field">
          <label htmlFor="card-bank">Bank</label>
          <select id="card-bank" value={values.pickerValue} disabled={saving || disabled} required aria-invalid={!!fieldErrors.bankId} aria-describedby={fieldErrors.bankId ? 'card-bank-error' : undefined} onChange={(event) => {
            const pickerValue = event.target.value;
            const shortcut = CARD_SHORTCUTS.find((card) => `${card.brand}:${card.bankId}` === pickerValue);
            onChange({ ...values, pickerValue, bankId: shortcut?.bankId ?? pickerValue, ...(shortcut ? { type: shortcut.type, variant: shortcut.variant } : {}) });
          }}>
            <option value="">Choose a bank or brand card</option>
            <optgroup label="Popular brand cards">{CARD_SHORTCUTS.filter((card) => bankNames.has(card.bankId)).map((card) => <option key={`${card.brand}:${card.bankId}`} value={`${card.brand}:${card.bankId}`}>{card.brand} ({bankNames.get(card.bankId)})</option>)}</optgroup>
            <optgroup label="Banks">{banks.data.items.map((bank) => <option key={bank.id} value={bank.id}>{bank.displayName}</option>)}</optgroup>
          </select>
          {fieldErrors.bankId && <p id="card-bank-error" className="field-error" role="alert">{fieldErrors.bankId}</p>}
        </div>
        <div className="card-add-field">
          <label htmlFor="card-type">Card type</label>
          <select id="card-type" value={values.type} disabled={saving || disabled} aria-invalid={!!fieldErrors.type} aria-describedby={fieldErrors.type ? 'card-type-error' : undefined} onChange={(event) => onChange({ ...values, type: event.target.value === 'debit' ? 'debit' : 'credit' })}>
            <option value="credit">Credit</option><option value="debit">Debit</option>
          </select>
          {fieldErrors.type && <p id="card-type-error" className="field-error" role="alert">{fieldErrors.type}</p>}
        </div>
        <div className="card-add-field">
          <label htmlFor="card-variant">Variant (optional)</label>
          <input id="card-variant" value={values.variant} autoComplete="off" placeholder="For example, Millennia" readOnly={saving || disabled} aria-invalid={!!fieldErrors.variant} aria-describedby={fieldErrors.variant ? 'card-variant-error' : undefined} onChange={(event) => onChange({ ...values, variant: event.target.value })}/>
          {fieldErrors.variant && <p id="card-variant-error" className="field-error" role="alert">{fieldErrors.variant}</p>}
        </div>
      </>}
      {error && !hasFieldErrors && <p id="card-save-error" className="field-error" role="alert" tabIndex={-1}>{error instanceof ApiError ? error.failure.message : 'We couldn’t save your card. Check your connection and try again.'}</p>}
      <Button type="submit" disabled={!ready || !values.bankId || saving || disabled}>{saving ? 'Saving…' : 'Save'}</Button>
    </form>
    {ready && <p className="card-bank-request"><a className="text-link" href={`mailto:${encodeURIComponent(banks.data.contactEmail)}?subject=${encodeURIComponent('Request to add a bank or brand card')}&body=${encodeURIComponent('Hello,\r\n\r\nPlease add this bank or brand card to CreditWithFriends:\r\n\r\nBank / brand card name:\r\n\r\nThank you.')}`}>Bank not listed? Ask us to add it</a><span>{banks.data.contactEmail}</span></p>}
  </>;
}
