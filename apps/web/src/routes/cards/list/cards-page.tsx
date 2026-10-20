import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { myCardsControllerList } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { PageFrame } from '../../../components/page-frame';
import { Button } from '../../../components/ui/button';
import './cards.css';

export function CardsPage() {
  // The API returns all of a member’s cards (at most 20) in one page.
  const cards = useQuery({ queryKey: ['my-cards'], networkMode: 'always', queryFn: async () => (await myCardsControllerList()).data.data! });
  useEffect(() => {
    document.title = 'Your cards | CreditWithFriends';
    return () => { document.title = 'CreditWithFriends'; };
  }, []);

  if (cards.error instanceof ApiError && (cards.error.status === 401 || cards.error.failure.code === 'PRIVACY_NOTICE_REQUIRED')) {
    location.replace(`${cards.error.status === 401 ? '/session' : '/notice'}?returnTo=${encodeURIComponent('/cards')}`);
    return null;
  }

  return <PageFrame><section className="cards-page">
    <Link className="button button--quiet" to="/">Back to your circles</Link>
    <header className="cards-header"><h1>Your cards</h1><p>The bank cards you hold.</p></header>
    {cards.isSuccess && !cards.isFetching && (cards.data.items.length < 20
      ? <Link className="button button--primary" to="/cards/add">Add a card</Link>
      : <p>You can list at most 20 cards.</p>)}
    {cards.isPending ? <p role="status">Loading your cards…</p> : cards.isError ? <div className="cards-state" role="alert">
      <h2>We couldn’t load your cards</h2><p>Check your connection and try again.</p>
      <Button variant="quiet" disabled={cards.isFetching} onClick={() => cards.refetch()}>{cards.isFetching ? 'Trying again…' : 'Try again'}</Button>
    </div> : cards.data.items.length === 0 ? <div className="cards-state">
      <h2>No cards yet</h2><p>The bank cards you hold will appear here, even if you haven’t joined a circle.</p>
    </div> : <ul className="cards-list" aria-label="Your cards">{cards.data.items.map((card) => <li key={card.id}>
      <h2>{card.bankName}</h2>
      <p>{card.type === 'credit' ? 'Credit card' : 'Debit card'}{card.variant && <> · {card.variant}</>}</p>
      <Link className="button button--quiet" to="/cards/$cardId/edit" params={{ cardId: card.id }} aria-label={`Edit ${card.bankName} ${card.type} card${card.variant ? ` ${card.variant}` : ''}`}>Edit</Link>
    </li>)}</ul>}
  </section></PageFrame>;
}
