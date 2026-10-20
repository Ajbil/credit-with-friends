import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate } from '@tanstack/react-router';
import { banksControllerList, myCardsControllerAdd, type AddCardDto } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { PageFrame } from '../../../components/page-frame';
import { Button } from '../../../components/ui/button';
import { CARD_SHORTCUTS } from './card-shortcuts';
import '../list/cards.css';
import './card-add.css';

function returnPath() {
  const value = new URLSearchParams(location.search).get('returnTo');
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/cards';
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : '/cards';
  } catch {
    return '/cards';
  }
}

export function AddCardPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const banks = useQuery({ queryKey: ['banks'], networkMode: 'always', queryFn: async () => (await banksControllerList({ page: 1, limit: 100 })).data.data! });
  const ready = banks.isSuccess && banks.data.items.length > 0;
  const focusBankAfterRetry = useRef(false);
  const [pickerValue, setPickerValue] = useState('');
  const [bankId, setBankId] = useState('');
  const [type, setType] = useState<AddCardDto['type']>('credit');
  const [variant, setVariant] = useState('');
  const saved = useRef(false);
  const save = useMutation({
    networkMode: 'always',
    mutationFn: () => myCardsControllerAdd({ bankId, type, variant: variant.trim() }),
    onSuccess: async () => {
      saved.current = true;
      await client.invalidateQueries({ queryKey: ['my-cards'] });
      await navigate({ to: returnPath(), ignoreBlocker: true });
    },
  });
  const dirty = !!bankId || type !== 'credit' || !!variant;
  useBlocker({
    shouldBlockFn: () => dirty && !saved.current && !window.confirm('Leave without saving this card?'),
    enableBeforeUnload: () => dirty && !saved.current,
  });
  const fieldErrors = save.error instanceof ApiError
    ? Object.fromEntries((save.error.failure.details?.fieldErrors ?? []).filter(({ field }) => ['bankId', 'type', 'variant'].includes(field)).map(({ field, reason }) => [field, reason]))
    : {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  useEffect(() => {
    document.title = 'Add a card | CreditWithFriends';
    return () => { document.title = 'CreditWithFriends'; };
  }, []);
  useEffect(() => {
    if (ready && focusBankAfterRetry.current) {
      document.getElementById('card-bank')?.focus();
      focusBankAfterRetry.current = false;
    }
  }, [ready]);
  useEffect(() => {
    if (!save.error) return;
    const field = save.error instanceof ApiError ? save.error.failure.details?.fieldErrors?.[0]?.field : undefined;
    document.getElementById(field === 'bankId' ? 'card-bank' : field === 'type' ? 'card-type' : field === 'variant' ? 'card-variant' : 'card-save-error')?.focus();
  }, [save.error]);

  const authError = [banks.error, save.error].find((error) => error instanceof ApiError && (error.status === 401 || error.failure.code === 'PRIVACY_NOTICE_REQUIRED'));
  if (authError instanceof ApiError) {
    saved.current = true;
    location.replace(`${authError.status === 401 ? '/session' : '/notice'}?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
    return null;
  }
  const bankNames = new Map(banks.data?.items.map((bank) => [bank.id, bank.displayName]));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !bankId || save.isPending) return;
    save.mutate();
  }

  return <PageFrame><section className="cards-page card-add-page">
    <Link className="button button--quiet" to="/cards">Back to your cards</Link>
    <header className="cards-header"><h1>Add a card</h1><p>Choose your bank or a brand card, then check the details.</p></header>
    <p className="card-reminder">Never enter card numbers, CVV, expiry dates or OTPs.</p>
    <form className="card-add-form" onSubmit={submit} noValidate aria-label="Add a card">
      {banks.isPending ? <p role="status">Loading banks…</p> : !ready ? <div className="cards-state" role="alert">
        <h2>We couldn’t load the banks</h2><p>Check your connection and try again.</p>
        <Button type="button" variant="quiet" disabled={banks.isFetching} onClick={() => { focusBankAfterRetry.current = true; banks.refetch(); }}>{banks.isFetching ? 'Trying again…' : 'Try again'}</Button>
      </div> : <>
        <div className="card-add-field">
          <label htmlFor="card-bank">Bank</label>
          <select id="card-bank" value={pickerValue} disabled={save.isPending} required aria-invalid={!!fieldErrors.bankId} aria-describedby={fieldErrors.bankId ? 'card-bank-error' : undefined} onChange={(event) => {
            setPickerValue(event.target.value);
            const shortcut = CARD_SHORTCUTS.find((card) => `${card.brand}:${card.bankId}` === event.target.value);
            setBankId(shortcut?.bankId ?? event.target.value);
            if (shortcut) { setType(shortcut.type); setVariant(shortcut.variant); }
            save.reset();
          }}>
            <option value="">Choose a bank or brand card</option>
            <optgroup label="Popular brand cards">{CARD_SHORTCUTS.filter((card) => bankNames.has(card.bankId)).map((card) => <option key={`${card.brand}:${card.bankId}`} value={`${card.brand}:${card.bankId}`}>{card.brand} ({bankNames.get(card.bankId)})</option>)}</optgroup>
            <optgroup label="Banks">{banks.data.items.map((bank) => <option key={bank.id} value={bank.id}>{bank.displayName}</option>)}</optgroup>
          </select>
          {fieldErrors.bankId && <p id="card-bank-error" className="field-error" role="alert">{fieldErrors.bankId}</p>}
        </div>
        <div className="card-add-field">
          <label htmlFor="card-type">Card type</label>
          <select id="card-type" value={type} disabled={save.isPending} aria-invalid={!!fieldErrors.type} aria-describedby={fieldErrors.type ? 'card-type-error' : undefined} onChange={(event) => { setType(event.target.value === 'debit' ? 'debit' : 'credit'); save.reset(); }}>
            <option value="credit">Credit</option><option value="debit">Debit</option>
          </select>
          {fieldErrors.type && <p id="card-type-error" className="field-error" role="alert">{fieldErrors.type}</p>}
        </div>
        <div className="card-add-field">
          <label htmlFor="card-variant">Variant (optional)</label>
          <input id="card-variant" value={variant} autoComplete="off" placeholder="For example, Millennia" readOnly={save.isPending} aria-invalid={!!fieldErrors.variant} aria-describedby={fieldErrors.variant ? 'card-variant-error' : undefined} onChange={(event) => { setVariant(event.target.value); save.reset(); }}/>
          {fieldErrors.variant && <p id="card-variant-error" className="field-error" role="alert">{fieldErrors.variant}</p>}
        </div>
      </>}
      {save.isError && !hasFieldErrors && <p id="card-save-error" className="field-error" role="alert" tabIndex={-1}>{save.error instanceof ApiError ? save.error.failure.message : 'We couldn’t save your card. Check your connection and try again.'}</p>}
      <Button type="submit" disabled={!ready || !bankId || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
    </form>
    {ready && <p className="card-bank-request"><a className="text-link" href={`mailto:${encodeURIComponent(banks.data.contactEmail)}?subject=${encodeURIComponent('Please add my bank')}&body=${encodeURIComponent('Bank name: ')}`}>Bank not listed? Ask us to add it</a><span>{banks.data.contactEmail}</span></p>}
  </section></PageFrame>;
}
