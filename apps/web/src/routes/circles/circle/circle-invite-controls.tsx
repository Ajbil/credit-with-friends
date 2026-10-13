import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { circleInviteControllerGet, circleInviteControllerRecord, circleInviteControllerReset, type RecordInviteDtoAction } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { Button } from '../../../components/ui/button';
import { whatsappInviteUrl } from './invite-share.helper';

export function CircleInviteControls({ circleId, name }: { circleId: string; name: string }) {
  const client = useQueryClient();
  const queryKey = ['circle-invite', circleId];
  const invite = useQuery({ queryKey, networkMode: 'always', queryFn: async ({ signal }) => (await circleInviteControllerGet(circleId, { signal })).data.data! });
  const [feedback, setFeedback] = useState('');
  const [isCopying, setIsCopying] = useState(false);
  const [copyError, setCopyError] = useState(false);
  // Usage is best effort. Never wait for it or retry a failed tap: that event stays uncounted.
  const record = useMutation({ networkMode: 'always', retry: false, mutationFn: (action: RecordInviteDtoAction) => circleInviteControllerRecord(circleId, { action }) });
  const reset = useMutation({
    networkMode: 'always', mutationFn: () => circleInviteControllerReset(circleId),
    onMutate: () => {
      setFeedback(''); setCopyError(false);
      // An older reload must not replace the new link after reset succeeds.
      return client.cancelQueries({ queryKey });
    },
    onSuccess: (response) => { client.setQueryData(queryKey, response.data.data!); setFeedback('Invite link reset. Share the new link.'); },
  });
  const accessError = [invite.error, reset.error].find((error) => error instanceof ApiError && (error.status === 401 || error.failure.code === 'PRIVACY_NOTICE_REQUIRED'));
  if (accessError instanceof ApiError) {
    const returnTo = encodeURIComponent(`/circles/${circleId}`);
    location.replace(`${accessError.status === 401 ? '/session' : '/notice'}?returnTo=${returnTo}`);
    return null;
  }

  async function copyLink() {
    if (!invite.data || isCopying || reset.isPending) return;
    setFeedback(''); setCopyError(false); setIsCopying(true); reset.reset();
    record.mutate('copy');
    // Call the clipboard directly during the tap, while the browser's user activation is live.
    try {
      await navigator.clipboard.writeText(invite.data.url);
      setFeedback('Invite link copied.');
    } catch { setCopyError(true); }
    finally { setIsCopying(false); }
  }

  return <section className="circle-invite" aria-labelledby="invite-heading">
    <h2 id="invite-heading">Invite people you trust</h2>
    <p>You’re the admin. Share this link with your circle’s WhatsApp group.</p>
    {invite.isPending ? <p role="status">Loading your invite link…</p> : invite.isError ? <div role="alert"><p>We couldn’t load the invite link. Please try again.</p><Button variant="quiet" onClick={() => invite.refetch()}>Try again</Button></div> : <>
      <label htmlFor="circle-invite-link">Invite link</label>
      <input id="circle-invite-link" type="text" readOnly value={invite.data.url} onFocus={(event) => event.currentTarget.select()} />
      <div className="circle-invite-actions">
        <Button variant="quiet" disabled={isCopying || reset.isPending} onClick={copyLink}>Copy</Button>
        <a className="button button--primary" href={reset.isPending ? undefined : whatsappInviteUrl(name, invite.data.url)} target="_blank" rel="noopener noreferrer" aria-disabled={reset.isPending} onClick={(event) => {
          if (reset.isPending) { event.preventDefault(); return; }
          setFeedback(''); setCopyError(false); reset.reset(); record.mutate('whatsapp');
        }}>Share on WhatsApp</a>
      </div>
      {feedback && <p className="circle-invite-feedback" role="status">{feedback}</p>}
      {copyError && <p className="field-error" role="alert">We couldn’t copy the link. Select it above and copy it, or use Share on WhatsApp.</p>}
      <div className="circle-invite-reset"><h3>Need a new link?</h3><p>If this link reaches someone you don’t trust, reset it. The old link stops working. People already in your circle stay.</p>
        <Button variant="quiet" disabled={reset.isPending || isCopying} onClick={() => {
          if (window.confirm('Reset the invite link? The old link will stop working immediately. People already in your circle will stay.')) reset.mutate();
        }}>{reset.isPending ? 'Resetting…' : 'Reset link'}</Button>
        {reset.isError && <p className="field-error" role="alert">We couldn’t reset the link. Please try again.</p>}
      </div>
    </>}
  </section>;
}
