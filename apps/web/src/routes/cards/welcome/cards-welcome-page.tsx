import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { PageFrame } from '../../../components/page-frame';
import './cards-welcome.css';

function returnPath() {
  const value = new URLSearchParams(location.search).get('returnTo');
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

export function CardsWelcomePage() {
  const destination = returnPath();
  useEffect(() => {
    document.title = 'Add your cards | CreditWithFriends';
    return () => { document.title = 'CreditWithFriends'; };
  }, []);

  return <PageFrame><section className="narrow-page cards-welcome-page">
    <h1>Add your cards</h1>
    <p>Let your circle know which bank cards you hold. Just choose your bank, credit or debit, and an optional variant.</p>
    <p>Only people in your circles can see your cards. Never enter card numbers, CVV, expiry dates or OTPs.</p>
    <p>You can add cards later from Your cards.</p>
    <div className="cards-welcome-actions">
      <a className="button button--primary" href={destination ? `/cards/add?returnTo=${encodeURIComponent(destination)}` : '/cards/add'}>Add a card</a>
      <Link className="button button--quiet" to={destination || '/'}>Skip for now</Link>
    </div>
  </section></PageFrame>;
}
