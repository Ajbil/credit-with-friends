import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { accountsControllerPending, joinCircleControllerJoin, joinCircleControllerPreview } from '../../../api/generated';
import { ApiError, googleStartUrl } from '../../../api/fetcher';
import { PageFrame } from '../../../components/page-frame';
import { Button } from '../../../components/ui/button';
import { joinErrorMessage } from './join-error.helper';
import { clearOnboardingInvite, destinationAfterInvite } from '../../cards/welcome/onboarding-invite.helper';
import './join.css';

export function JoinPage() {
  const { code } = useParams({ from: '/circles/join/$code' });
  return <InvitePage key={code} code={code} />;
}

function InvitePage({ code }: { code: string }) {
  const client = useQueryClient();
  const returnPath = `/circles/join/${encodeURIComponent(code)}`;
  const redirected = useRef(false);
  const invite = useQuery({
    queryKey: ['circle-invite', code], networkMode: 'always', refetchOnMount: 'always',
    queryFn: async () => (await joinCircleControllerPreview(encodeURIComponent(code))).data.data!,
  });
  const accountRequired = invite.isSuccess && !invite.isFetching && invite.data.status === 'account_required';
  const pending = useQuery({
    queryKey: ['invite-sign-in', code], queryFn: accountsControllerPending,
    enabled: accountRequired, networkMode: 'always', refetchOnMount: 'always',
  });
  const join = useMutation({
    networkMode: 'always',
    mutationFn: () => joinCircleControllerJoin(encodeURIComponent(code)),
    onSuccess: (response) => {
      void client.invalidateQueries({ queryKey: ['circles'] });
      if (!redirected.current) {
        redirected.current = true;
        location.assign(destinationAfterInvite(returnPath, `/circles/${response.data.data!.circleId}`));
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && ['INVITE_LINK_INVALID', 'JOIN_BLOCKED', 'CIRCLE_FULL', 'TOO_MANY_CIRCLES'].includes(error.failure.code)) {
        clearOnboardingInvite();
      }
      if (error instanceof ApiError && (error.status === 401 || error.failure.code === 'ACCOUNT_INCOMPLETE')) {
        // Reload the invite to validate the link before offering sign-in again.
        location.replace(returnPath);
      }
      if (error instanceof ApiError && error.failure.code === 'PRIVACY_NOTICE_REQUIRED') {
        location.replace(`/notice?returnTo=${encodeURIComponent(returnPath)}`);
      }
    },
  });

  useEffect(() => { clearOnboardingInvite(returnPath); }, [returnPath]);

  useEffect(() => {
    if (accountRequired && pending.isSuccess && !pending.isFetching) {
      location.replace(`/onboarding?returnTo=${encodeURIComponent(returnPath)}`);
    }
    if (invite.isSuccess && !invite.isFetching && invite.data?.status === 'already_member' && !redirected.current) {
      // Strict Mode may replay this effect; consuming the flag twice loses the welcome page.
      redirected.current = true;
      location.replace(destinationAfterInvite(returnPath, `/circles/${invite.data.circleId}`));
    }
    if ((invite.isSuccess && !invite.isFetching && invite.data.status === 'blocked') ||
      (invite.error instanceof ApiError && invite.error.failure.code === 'INVITE_LINK_INVALID')) {
      clearOnboardingInvite();
    }
    if (invite.error instanceof ApiError && invite.error.failure.code === 'PRIVACY_NOTICE_REQUIRED') {
      location.replace(`/notice?returnTo=${encodeURIComponent(returnPath)}`);
    }
  }, [accountRequired, pending.isSuccess, pending.isFetching, invite.data, invite.error, invite.isFetching, invite.isSuccess, returnPath]);

  const error = invite.error ?? join.error;
  const invalid = error instanceof ApiError && error.failure.code === 'INVITE_LINK_INVALID';
  const blockedError = join.error instanceof ApiError && join.error.failure.code === 'JOIN_BLOCKED' ? join.error : null;
  const signInError = accountRequired && pending.isError && !(pending.error instanceof ApiError && pending.error.status === 401);
  let content;
  if (invalid) content = <>
    <h1>Circle invite</h1>
    <p role="alert">{error.message}</p>
    <Link className="button button--quiet" to="/">Back to home</Link>
  </>;
  else if (invite.data?.status === 'blocked' || blockedError) content = <>
    <h1>Circle invite</h1>
    <p role="alert">{blockedError ? blockedError.message : "You can't join this circle."}</p>
    <Link className="button button--quiet" to="/">Back to home</Link>
  </>;
  else if (invite.isPending || invite.isFetching || join.isSuccess || invite.data?.status === 'already_member' || (accountRequired && (pending.isPending || pending.isFetching || pending.isSuccess))) content = <>
    <h1>Circle invite</h1><p role="status">{join.isSuccess || invite.data?.status === 'already_member' ? 'Opening your circle…' : 'Checking this invite…'}</p>
  </>;
  else if (invite.isError || signInError) content = <>
    <h1>Circle invite</h1><p role="alert">We couldn’t load this invite. Check your connection and try again.</p>
    <Button variant="quiet" onClick={() => { void invite.refetch(); if (accountRequired) void pending.refetch(); }}>Try again</Button>
  </>;
  else if (invite.data?.status === 'account_required') content = <>
    <h1 className="join-page__invitation">You’re invited to a circle on CreditWithFriends</h1>
    <p>See which friends hold the card a shop’s offer needs, and ask them on WhatsApp in one tap. Card numbers are never shared.</p>
    <p>Only people in your circles see which cards you hold. You sign in with Google, so we never see your password.</p>
    <p><Link className="text-link" to="/privacy">Read our privacy notice</Link></p>
    <p className="join-page__note">Free · takes about a minute</p>
    <a className="button button--primary" href={googleStartUrl(returnPath)}>Continue with Google</a>
  </>;
  else content = <>
    <h1>You’re about to join {invite.data?.name}</h1>
    <p>{new Intl.NumberFormat('en-IN').format(invite.data?.memberCount ?? 0)} {invite.data?.memberCount === 1 ? 'member' : 'members'}</p>
    <Button disabled={join.isPending} aria-busy={join.isPending} onClick={() => { if (!join.isPending) join.mutate(); }}>{join.isPending ? 'Joining…' : 'Join'}</Button>
    {join.isPending && <p role="status">Joining your circle…</p>}
    {join.isError && <p role="alert">{joinErrorMessage(join.error)}</p>}
  </>;

  return <PageFrame><section className="narrow-page join-page">{content}
  </section></PageFrame>;
}
