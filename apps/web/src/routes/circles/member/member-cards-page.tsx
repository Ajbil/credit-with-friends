import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { memberCardsControllerView } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { PageFrame } from '../../../components/page-frame';
import { Button } from '../../../components/ui/button';
import '../../cards/list/cards.css';
import './member-cards.css';

export function MemberCardsPage() {
  const { circleId, memberId } = useParams({ from: '/circles/$circleId/members/$memberId/cards' });
  return <MemberCardsVisit key={`${circleId}/${memberId}`} circleId={circleId} memberId={memberId} />;
}

function MemberCardsVisit({ circleId, memberId }: { circleId: string; memberId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const cards = useQuery({
    queryKey: ['member-cards', circleId, memberId], networkMode: 'always', refetchOnMount: 'always', gcTime: 0,
    queryFn: async ({ signal }) => (await memberCardsControllerView(encodeURIComponent(circleId), encodeURIComponent(memberId), { signal })).data.data!,
  });
  const succeededThisVisit = cards.isFetchedAfterMount && cards.isSuccess;
  // Only this visit's successful check permits keeping cards through a refresh failure.
  useEffect(() => { if (succeededThisVisit) setConfirmed(true); }, [succeededThisVisit]);
  const hasConfirmedData = confirmed || succeededThisVisit;
  const unavailable = cards.isFetchedAfterMount && cards.error instanceof ApiError && cards.error.status === 404;
  const title = hasConfirmedData && cards.data && !unavailable ? `${cards.data.displayName}’s cards` : 'Member cards';
  useEffect(() => {
    document.title = `${title} | CreditWithFriends`;
    return () => { document.title = 'CreditWithFriends'; };
  }, [title]);

  if (cards.isFetchedAfterMount && cards.error instanceof ApiError && (cards.error.status === 401 || cards.error.failure.code === 'PRIVACY_NOTICE_REQUIRED')) {
    const returnTo = encodeURIComponent(`/circles/${encodeURIComponent(circleId)}/members/${encodeURIComponent(memberId)}/cards`);
    location.replace(`${cards.error.status === 401 ? '/session' : '/notice'}?returnTo=${returnTo}`);
    return null;
  }

  return <PageFrame><section className="cards-page member-cards-page">
    <Link className="button button--quiet" to="/circles/$circleId" params={{ circleId }}>Back to circle</Link>
    {!cards.isFetchedAfterMount ? <><h1>Member cards</h1><p role="status">Loading this member’s cards…</p></> : unavailable ? <div className="cards-state" role="alert">
      <h1>Member cards unavailable</h1><p>These cards aren’t available. You can see a member’s cards only while you both belong to this circle.</p>
    </div> : !hasConfirmedData || !cards.data ? <div className="cards-state" role="alert">
      <h1>We couldn’t load this member’s cards</h1><p>Check your connection and try again.</p>
      <Button variant="quiet" disabled={cards.isFetching} onClick={() => cards.refetch()}>{cards.isFetching ? 'Trying again…' : 'Try again'}</Button>
    </div> : <>
      <header className="cards-header"><h1>{title}</h1><p>The bank cards they hold.</p></header>
      {cards.isError && <div className="cards-state" role="alert">
        <p>We couldn’t refresh these cards. Check your connection and try again.</p>
        <Button variant="quiet" disabled={cards.isFetching} onClick={() => cards.refetch()}>{cards.isFetching ? 'Trying again…' : 'Try again'}</Button>
      </div>}
      {cards.data.cards.length === 0 ? <div className="cards-state">
        <h2>No cards listed yet</h2><p>{cards.data.displayName} hasn’t listed any bank cards yet.</p>
      </div> : <ul className="cards-list" aria-label="Member cards">{cards.data.cards.map((card) => <li key={card.id}>
        <h2>{card.bankName}</h2><p>{card.type === 'credit' ? 'Credit card' : 'Debit card'}{card.variant && <> · {card.variant}</>}</p>
      </li>)}</ul>}
    </>}
    <Link className="button button--quiet member-cards-home" to="/">Back to your circles</Link>
  </section></PageFrame>;
}
