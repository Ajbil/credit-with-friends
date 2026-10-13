import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { accountsControllerMe, viewCircleControllerView } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { Button } from '../../../components/ui/button';
import { PageFrame } from '../../../components/page-frame';
import { CircleInviteControls } from './circle-invite-controls';
import './circle.css';

export function CirclePage() {
  const { circleId } = useParams({ from: '/circles/$circleId' });
  const circle = useQuery({ queryKey: ['circle', circleId], networkMode: 'always', queryFn: async () => (await viewCircleControllerView(circleId)).data.data! });
  const account = useQuery({ queryKey: ['member'], networkMode: 'always', queryFn: async () => (await accountsControllerMe()).data.data! });
  useEffect(() => {
    document.title = circle.isSuccess ? `${circle.data.name} | CreditWithFriends` : 'Circle | CreditWithFriends';
    return () => { document.title = 'CreditWithFriends'; };
  }, [circle.isSuccess, circle.data?.name]);
  const accessError = [circle.error, account.error].find((error) => error instanceof ApiError && (error.status === 401 || error.failure.code === 'PRIVACY_NOTICE_REQUIRED'));
  if (accessError instanceof ApiError) {
    const returnTo = encodeURIComponent(`/circles/${circleId}`);
    location.replace(`${accessError.status === 401 ? '/session' : '/notice'}?returnTo=${returnTo}`);
    return null;
  }
  return <PageFrame><section className="circle-page">
    <Link className="button button--quiet" to="/">Back to your circles</Link>
    {circle.isPending ? <p role="status">Loading your circle…</p> : circle.isError ? <div role="alert">
      <h1>{circle.error instanceof ApiError && circle.error.status === 404 ? 'Circle unavailable' : 'We couldn’t load your circle'}</h1>
      <p>{circle.error instanceof ApiError && circle.error.status === 404 ? 'Go back to your circles, or ask the admin for an invite link.' : 'Please try again to see your circle.'}</p>
      {!(circle.error instanceof ApiError && circle.error.status === 404) && <Button variant="quiet" onClick={() => circle.refetch()}>Try again</Button>}
    </div> : <>
      <header className="circle-header"><h1>{circle.data.name}</h1><p>{new Intl.NumberFormat('en-IN').format(circle.data.members.length)} {circle.data.members.length === 1 ? 'member' : 'members'}</p></header>
      <div className="circle-layout">
        <section aria-labelledby="members-heading"><h2 id="members-heading">Members</h2>
          {circle.data.members.length === 0 ? <><p>No members to show. Try loading your circle again.</p><Button variant="quiet" onClick={() => circle.refetch()}>Try again</Button></> : <ul className="circle-members" aria-label="Circle members">{circle.data.members.map((member) => <li key={member.id}>
            <span>{member.displayName}</span>{member.isAdmin && <span className="circle-admin">Admin</span>}
          </li>)}</ul>}
        </section>
        {account.isPending ? <p role="status">Checking your invite access…</p> : account.isError ? <div role="alert"><p>We couldn’t check your invite access. Please try again.</p><Button variant="quiet" onClick={() => account.refetch()}>Try again</Button></div> : circle.data.members.some((member) => member.id === account.data.id && member.isAdmin) && <CircleInviteControls circleId={circleId} name={circle.data.name} />}
      </div>
    </>}
  </section></PageFrame>;
}
