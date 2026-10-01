import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { accountsControllerMe, accountsControllerPending } from '../api/generated';
import { ApiError, googleStartUrl } from '../api/fetcher';
import { PageFrame } from '../components/page-frame';

function returnPath(): string {
  const queryPath = new URLSearchParams(location.search).get('returnTo');
  if (queryPath?.startsWith('/') && !queryPath.startsWith('//')) return queryPath;
  return location.pathname === '/' ? '/' : `${location.pathname}${location.search}`;
}

export function SignInPage() {
  const member = useQuery({ queryKey: ['member'], queryFn: accountsControllerMe });
  const pending = useQuery({ queryKey: ['pending'], queryFn: accountsControllerPending, enabled: member.error instanceof ApiError && member.error.status === 403 });
  const path = returnPath();
  return <PageFrame><section className="hero">
    <div className="hero-copy">
      <h1>Find the card. Ask a friend.</h1>
      <p>When a card offer catches your eye, find someone you trust who holds that card and ask them on WhatsApp.</p>
      {member.isPending ? <p role="status">Checking your sign-in…</p> : member.isSuccess ? <div className="status-panel"><h2>You're signed in</h2><p>Your account is ready. Circles and cards are coming soon.</p></div> : pending.isSuccess ? <div className="status-panel"><p>Finish setting up your account to continue.</p><Link className="button button--primary" to="/onboarding">Continue setup</Link></div> : member.error instanceof ApiError && member.error.status === 401 ? <a className="button button--primary" href={googleStartUrl(path)}><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.35 12.23c0-.7-.06-1.37-.18-2.02H12v3.82h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.19Z"/><path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.43-2.33l-3.14-2.45c-.87.58-1.99.93-3.29.93-2.53 0-4.67-1.71-5.44-4.01H3.32v2.52A9.75 9.75 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.56 13.89a5.86 5.86 0 0 1 0-3.78V7.59H3.32a9.75 9.75 0 0 0 0 8.82l3.24-2.52Z"/><path fill="#EA4335" d="M12 6.1c1.42 0 2.69.49 3.69 1.45l2.77-2.77A9.4 9.4 0 0 0 12 2.25a9.75 9.75 0 0 0-8.68 5.34l3.24 2.52C7.33 7.81 9.47 6.1 12 6.1Z"/></svg>Continue with Google</a> : <div role="alert" className="notice-error"><p>We couldn't check your sign-in. Please try again.</p><button className="text-button" onClick={() => member.refetch()}>Try again</button></div>}
      <p className="supporting-copy">For people in your trusted circles. No card numbers, ever.</p>
    </div>
    <div className="hero-art" aria-hidden="true"><span className="orbit orbit-one"/><span className="orbit orbit-two"/><span className="art-card art-card-back"/><span className="art-card art-card-front"><span className="card-symbol"/><span className="card-lines"/></span><span className="art-message">Ask someone you know</span></div>
  </section></PageFrame>;
}
