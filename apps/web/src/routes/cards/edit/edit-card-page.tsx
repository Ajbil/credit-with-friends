import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate, useParams } from '@tanstack/react-router';
import { banksControllerList, myCardsControllerEdit, myCardsControllerList, myCardsControllerRemove, type MyCardDto } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { PageFrame } from '../../../components/page-frame';
import { Button } from '../../../components/ui/button';
import { CardForm, CardReminder, type CardValues } from '../add/card-form';
import './card-edit.css';

export function EditCardPage() {
  const { cardId } = useParams({ from: '/cards/$cardId/edit' });
  // The own-card list is the API's read endpoint; it contains at most 20 cards.
  const cards = useQuery({ queryKey: ['my-cards'], networkMode: 'always', queryFn: async () => (await myCardsControllerList()).data.data! });
  const card = cards.data?.items.find((item) => item.id === cardId);

  useEffect(() => {
    document.title = 'Edit a card | CreditWithFriends';
    return () => { document.title = 'CreditWithFriends'; };
  }, []);

  if (cards.error instanceof ApiError && (cards.error.status === 401 || cards.error.failure.code === 'PRIVACY_NOTICE_REQUIRED')) {
    location.replace(`${cards.error.status === 401 ? '/session' : '/notice'}?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
    return null;
  }

  return <PageFrame><section className="cards-page card-add-page">
    <Link className="button button--quiet" to="/cards">Back to your cards</Link>
    <header className="cards-header"><h1>Edit a card</h1><p>Update your bank, card type or variant.</p></header>
    <CardReminder />
    {cards.isPending ? <><p role="status">Loading your card…</p><Button disabled>Save</Button></> : cards.isError ? <div className="cards-state card-load-error" role="alert">
      <h2>We couldn’t load your card</h2><p>Check your connection and try again.</p>
      <Button variant="quiet" disabled={cards.isFetching} onClick={() => cards.refetch()}>{cards.isFetching ? 'Trying again…' : 'Try again'}</Button>
      <Button disabled>Save</Button>
    </div> : !card ? <CardNotFound /> : <CardEditor key={card.id} card={card} />}
  </section></PageFrame>;
}

function CardNotFound() {
  return <div className="cards-state" role="alert"><h2>Card not found</h2><p>This card isn’t in your cards. Go back to your cards to choose another.</p><Button disabled>Save</Button></div>;
}

function CardEditor({ card }: { card: MyCardDto }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const banks = useQuery({ queryKey: ['banks'], networkMode: 'always', queryFn: async () => (await banksControllerList({ page: 1, limit: 100 })).data.data! });
  const ready = banks.isSuccess && banks.data.items.length > 0;
  const [values, setValues] = useState<CardValues>({ pickerValue: card.bankId, bankId: card.bankId, type: card.type, variant: card.variant ?? '' });
  const finished = useRef(false);
  async function returnToCards() {
    finished.current = true;
    await client.invalidateQueries({ queryKey: ['my-cards'] });
    await navigate({ to: '/cards', ignoreBlocker: true });
  }
  const save = useMutation({
    networkMode: 'always',
    mutationFn: () => myCardsControllerEdit(card.id, { bankId: values.bankId, type: values.type, variant: values.variant.trim() }),
    onSuccess: returnToCards,
  });
  const remove = useMutation({
    networkMode: 'always',
    mutationFn: () => myCardsControllerRemove(card.id),
    onSuccess: returnToCards,
  });
  const dirty = values.bankId !== card.bankId || values.type !== card.type || values.variant !== (card.variant ?? '');
  useBlocker({
    shouldBlockFn: () => dirty && !finished.current && !window.confirm('Leave without saving this card?'),
    enableBeforeUnload: () => dirty && !finished.current,
  });
  useEffect(() => {
    if (remove.error) document.getElementById('card-remove-error')?.focus();
  }, [remove.error]);

  const authError = [banks.error, save.error, remove.error].find((error) => error instanceof ApiError && (error.status === 401 || error.failure.code === 'PRIVACY_NOTICE_REQUIRED'));
  if (authError instanceof ApiError) {
    finished.current = true;
    location.replace(`${authError.status === 401 ? '/session' : '/notice'}?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
    return null;
  }
  if ([save.error, remove.error].some((error) => error instanceof ApiError && error.status === 404)) return <CardNotFound />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !values.bankId || save.isPending || remove.isPending) return;
    save.mutate();
  }

  function confirmRemove() {
    if (save.isPending || remove.isPending || finished.current) return;
    const name = `${card.bankName} ${card.type} card${card.variant ? ` ${card.variant}` : ''}`;
    if (window.confirm(`Remove ${name}? This permanently removes it from your cards. You can add it again later.`)) remove.mutate();
  }

  return <>
    <CardForm banks={banks} values={values} onChange={(next) => { setValues(next); save.reset(); remove.reset(); }} onSubmit={submit} saving={save.isPending} disabled={remove.isPending} error={save.error} label="Edit a card" />
    <section className="cards-state card-remove" aria-labelledby="card-remove-heading">
      <h2 id="card-remove-heading">Remove this card</h2><p>You can add it again later.</p>
      <Button type="button" variant="quiet" disabled={save.isPending || remove.isPending} aria-busy={remove.isPending} onClick={confirmRemove}>{remove.isPending ? 'Removing…' : 'Remove card'}</Button>
      {remove.isError && <p id="card-remove-error" className="field-error" role="alert" tabIndex={-1}>{remove.error instanceof ApiError ? remove.error.failure.message : 'We couldn’t remove your card. Check your connection and try again.'}</p>}
    </section>
  </>;
}
