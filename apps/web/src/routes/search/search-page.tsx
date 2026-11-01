import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { banksControllerList, searchesControllerSearch, type SearchCriteriaDto, type SearchesDataDto, type SearchPersonDto } from '../../api/generated';
import { ApiError } from '../../api/fetcher';
import { PageFrame } from '../../components/page-frame';
import { Button } from '../../components/ui/button';
import { ContactReminder, WhatsAppContact } from '../../components/whatsapp-contact';
import { BankCardPicker } from '../cards/add/card-form';
import './search.css';

type SearchValues = SearchCriteriaDto & { pickerValue: string; variant: string };
type SearchSnapshot = { values: SearchValues; criteria: SearchCriteriaDto; data: SearchesDataDto };
const INITIAL_VALUES: SearchValues = { pickerValue: '', bankId: '', type: 'any', variant: '' };
const TYPE_LABELS = { credit: 'Credit', debit: 'Debit', any: 'Credit or debit' } as const;
const GROUP_LABELS = { matching: 'Matching variant', similar: 'Similar variant', unstated: 'Variant not stated' } as const;

function SearchPeople({ people }: { people: SearchPersonDto[] }) {
  return <ul className="search-people">{people.map((person) => <li key={person.memberId}>
    <h3>{person.displayName}</h3>
    <p className="search-circles">In {person.circles.map((circle, index) => <span key={circle.id}>{index > 0 && ', '}<span>{circle.name}</span></span>)}</p>
    {person.cards.map((card) => <div className="search-card" key={card.id} role="group" aria-label={`${card.bankName} ${card.type} card, ${card.variant || 'No variant'}`}>
      <div><strong><span className="search-card-bank">{card.bankName} </span><span className="search-card-type">{card.type} card</span></strong><p>{card.variant || 'No variant'}</p></div>
      <WhatsAppContact cardId={card.id} returnTo="/search" />
    </div>)}
  </li>)}</ul>;
}

export function SearchPage() {
  // Only a completed search lives in this tab's history entry. Nothing enters the
  // URL, local/session storage, query keys or logs. A return never repeats the POST.
  const [snapshot, setSnapshot] = useState<SearchSnapshot | null>(() => window.history.state?.cwfCardSearch ?? null);
  const [values, setValues] = useState<SearchValues>(() => snapshot?.values ?? INITIAL_VALUES);
  const focusBankAfterRetry = useRef(false);
  const banks = useQuery({ queryKey: ['banks'], networkMode: 'always', queryFn: async () => (await banksControllerList({ page: 1, limit: 100 })).data.data! });
  const ready = banks.isSuccess && banks.data.items.length > 0;
  const search = useMutation({
    networkMode: 'always',
    mutationFn: async ({ criteria, page }: { criteria: SearchCriteriaDto; page: number; values: SearchValues }) => (await searchesControllerSearch(criteria, { page, limit: 100 })).data.data!,
    onSuccess: (data, request) => {
      setSnapshot((previous) => ({ values: request.values, criteria: request.criteria, data: { ...data, items: request.page === 1 ? data.items : [...(previous?.data.items ?? []), ...data.items] } }));
    },
  });
  const fieldErrors = search.error instanceof ApiError
    ? Object.fromEntries((search.error.failure.details?.fieldErrors ?? []).filter(({ field }) => ['bankId', 'type', 'variant'].includes(field)).map(({ field, reason }) => [field, reason]))
    : {};
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  useEffect(() => {
    document.title = 'Find a card | CreditWithFriends';
    return () => { document.title = 'CreditWithFriends'; };
  }, []);
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, cwfCardSearch: snapshot }, '');
  }, [snapshot]);
  useEffect(() => {
    if (ready && focusBankAfterRetry.current) {
      document.getElementById('search-bank')?.focus();
      focusBankAfterRetry.current = false;
    }
  }, [ready]);
  useEffect(() => {
    if (!search.error) return;
    const field = search.error instanceof ApiError ? search.error.failure.details?.fieldErrors?.[0]?.field : undefined;
    document.getElementById(field === 'bankId' ? 'search-bank' : field === 'type' ? 'search-type-credit' : field === 'variant' ? 'search-variant' : 'search-error')?.focus();
  }, [search.error]);

  const authError = [banks.error, search.error].find((error) => error instanceof ApiError && (error.status === 401 || error.failure.code === 'PRIVACY_NOTICE_REQUIRED'));
  if (authError instanceof ApiError) {
    location.replace(`${authError.status === 401 ? '/session' : '/notice'}?returnTo=${encodeURIComponent('/search')}`);
    return null;
  }

  function change(next: SearchValues) { setValues(next); search.reset(); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !values.bankId || search.isPending) return;
    const criteria: SearchCriteriaDto = { bankId: values.bankId, type: values.type, ...(values.variant.trim() ? { variant: values.variant.trim() } : {}) };
    setSnapshot(null);
    search.mutate({ criteria, page: 1, values });
  }

  return <PageFrame><section className="cards-page search-page">
    <Link className="button button--quiet" to="/">Back to your circles</Link>
    <header className="cards-header"><h1>Find a card</h1><p>See who in your circles holds the card an offer needs.</p></header>
    <div className="search-layout">
      <form className="card-add-form search-form" aria-label="Find a card" onSubmit={submit} noValidate>
        {banks.isPending ? <p role="status">Loading banks…</p> : !ready ? <div role="alert">
          <h2>We couldn’t load the banks</h2><p>Check your connection and try again.</p>
          <Button type="button" variant="quiet" disabled={banks.isFetching} onClick={() => { focusBankAfterRetry.current = true; banks.refetch(); }}>{banks.isFetching ? 'Trying again…' : 'Try again'}</Button>
        </div> : <>
          <BankCardPicker banks={banks.data} value={values.pickerValue} onChange={(selection) => change({ ...values, ...selection })} id="search-bank" label="Bank or brand card" disabled={search.isPending} error={fieldErrors.bankId} />
          <fieldset className="search-type" aria-describedby={fieldErrors.type ? 'search-type-error' : undefined} aria-invalid={!!fieldErrors.type}>
            <legend>Card type</legend>
            <div>{(['credit', 'debit', 'any'] as const).map((type) => <label key={type}>
              <input id={`search-type-${type}`} type="radio" name="card-type" value={type} checked={values.type === type} disabled={search.isPending} onChange={() => change({ ...values, type })} />
              <span>{TYPE_LABELS[type]}</span>
            </label>)}</div>
            {fieldErrors.type && <p id="search-type-error" className="field-error" role="alert">{fieldErrors.type}</p>}
          </fieldset>
          <div className="card-add-field">
            <label htmlFor="search-variant">Variant <span className="search-optional">(optional)</span></label>
            <input id="search-variant" value={values.variant} placeholder="For example, Millennia" autoComplete="off" readOnly={search.isPending} aria-invalid={!!fieldErrors.variant} aria-describedby={fieldErrors.variant ? 'search-variant-error' : undefined} onChange={(event) => change({ ...values, variant: event.target.value })} />
            {fieldErrors.variant && <p id="search-variant-error" className="field-error" role="alert">{fieldErrors.variant}</p>}
          </div>
        </>}
        <Button type="submit" disabled={!ready || !values.bankId || search.isPending}>{search.isPending ? 'Searching…' : 'Search'}</Button>
        {ready && !snapshot && !search.isError && <p className="search-help">Only people who share a circle with you appear.</p>}
      </form>
      <section className="search-results" aria-label="Search results" aria-busy={search.isPending}>
        {search.isPending && <p role="status">Searching your circles…</p>}
        {search.isError && !hasFieldErrors && <div className="search-state" role="alert" id="search-error" tabIndex={-1}>
          <h2>Search didn’t finish</h2><p>We couldn’t search your circles. Check your connection and try again.</p>
          <Button variant="quiet" onClick={() => { if (search.variables) search.mutate(search.variables); }}>Try again</Button>
        </div>}
        {snapshot && (snapshot.data.items.length === 0 ? <p className="search-state" role="status">No one in your circles has this card yet.</p> : <>
          <Button className="search-change" variant="quiet" disabled={!ready || search.isPending} onClick={() => document.getElementById('search-bank')?.focus()}>Change search</Button>
          <div className="search-results-head" role="status"><h2>{new Intl.NumberFormat('en-IN').format(snapshot.data.pagination.totalItems)} {snapshot.data.pagination.totalItems === 1 ? 'person' : 'people'}</h2><p>{snapshot.data.items[0].cards[0].bankName} · {TYPE_LABELS[snapshot.criteria.type]}</p></div>
          <ContactReminder />
          {snapshot.data.items.some((person) => person.group === 'all') ? <SearchPeople people={snapshot.data.items} /> : (['matching', 'similar', 'unstated'] as const).map((group) => {
            const people = snapshot.data.items.filter((person) => person.group === group);
            return people.length > 0 && <section className="search-group" key={group}><h2>{GROUP_LABELS[group]}</h2><SearchPeople people={people} /></section>;
          })}
          {snapshot.data.pagination.page < snapshot.data.pagination.totalPages && <Button variant="quiet" disabled={search.isPending} onClick={() => search.mutate({ criteria: snapshot.criteria, values: snapshot.values, page: snapshot.data.pagination.page + 1 })}>{search.isPending ? 'Loading…' : 'Show more'}</Button>}
        </>)}
      </section>
    </div>
  </section></PageFrame>;
}
