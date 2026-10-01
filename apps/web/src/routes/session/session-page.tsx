import { PageFrame } from '../../components/page-frame';
import { googleStartUrl } from '../../api/fetcher';

export function SessionPage() {
  const path = new URLSearchParams(location.search).get('returnTo');
  const returnTo = path?.startsWith('/') && !path.startsWith('//') ? path : '/profile';
  return <PageFrame><section className="narrow-page"><h1>Your sign-in has ended</h1><p>Sign in with Google again to continue. Your details are safe.</p><a className="button button--primary" href={googleStartUrl(returnTo)}>Continue with Google</a></section></PageFrame>;
}
