import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { accountsControllerNotice } from '../../api/generated';
import { apiFetch, ApiError } from '../../api/fetcher';
import { Button } from '../../components/ui/button';
import { PageFrame } from '../../components/page-frame';
import './notice.css';

export function NoticePage() {
  const client = useQueryClient();
  const notice = useQuery({ queryKey: ['notice'], queryFn: async () => (await accountsControllerNotice()).data.data! });
  const [agreed, setAgreed] = useState(false);
  const accept = useMutation({ mutationFn: () => apiFetch('/api/v1/privacy-notice/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: notice.data!.version, isConsentGiven: true }) }), onSuccess: () => {
    client.invalidateQueries({ queryKey: ['member'] });
    const path = new URLSearchParams(location.search).get('returnTo');
    location.replace(path?.startsWith('/') && !path.startsWith('//') ? path : '/profile');
  } });
  if (notice.isPending) return <PageFrame><section className="notice-layout"><p role="status">Loading the privacy notice…</p></section></PageFrame>;
  if (notice.error instanceof ApiError && notice.error.status === 401) { location.replace('/session'); return null; }
  if (notice.isError) return <PageFrame><section className="notice-layout"><h1>We couldn't load the privacy notice</h1><p>Please try again later.</p><Button onClick={() => notice.refetch()}>Try again</Button></section></PageFrame>;
  return <PageFrame><section className="notice-layout"><h1>Review the privacy notice</h1><p>Our privacy notice has changed. Please review it before continuing.</p><div className="notice-full-text">{notice.data.text}</div><label className="check-row"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)}/><span>I agree to the privacy notice.</span></label><Button disabled={!agreed || accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? 'Saving…' : 'Accept and continue'}</Button>{accept.isError && <p role="alert" className="field-error">We couldn’t save your agreement. Please reload the notice and try again.</p>}</section></PageFrame>;
}
