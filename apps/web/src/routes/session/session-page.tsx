import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PageFrame } from '../../components/page-frame';
import { googleStartUrl } from '../../api/fetcher';
import { safeReturnPath } from './safe-return-path';

export function SessionPage() {
  const client = useQueryClient();
  useEffect(() => { client.clear(); }, [client]);
  const returnTo = safeReturnPath(new URLSearchParams(location.search).get('returnTo'));
  return <PageFrame><section className="narrow-page"><h1>Your sign-in has ended</h1><p>Sign in with Google again to continue. Your details are safe.</p><a className="button button--primary" href={googleStartUrl(returnTo)}>Continue with Google</a></section></PageFrame>;
}
