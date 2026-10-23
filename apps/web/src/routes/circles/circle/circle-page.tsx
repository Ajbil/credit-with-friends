import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { accountsControllerMe, viewCircleControllerView } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { Button } from '../../../components/ui/button';
import { PageFrame } from '../../../components/page-frame';
import { CircleInviteControls } from './circle-invite-controls';
import { CircleLeave } from './circle-leave';
import { CircleClearRemovals, CircleMemberRemoval } from './circle-member-removal';
import { CircleAdminSettings } from './circle-admin-settings';
import './circle.css';
import '../member/member-cards.css';

export function CirclePage() {
  const { circleId } = useParams({ from: '/circles/$circleId' });
  const circle = useQuery({ queryKey: ['circle', circleId], networkMode: 'always', queryFn: async () => (await viewCircleControllerView(circleId)).data.data! });
  const account = useQuery({ queryKey: ['member'], networkMode: 'always', queryFn: async () => (await accountsControllerMe()).data.data! });
  const currentMember = account.isSuccess ? circle.data?.members.find((member) => member.id === account.data.id) : undefined;
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
          {circle.data.members.length === 0 ? <><p>No members to show. Try loading your circle again.</p><Button variant="quiet" onClick={() => circle.refetch()}>Try again</Button></> : <ul className="circle-members" aria-label="Circle members">{circle.data.members.map((member) => <li key={member.id} className={currentMember && member.id !== currentMember.id ? 'circle-member-row' : undefined}>
            {currentMember && member.id !== currentMember.id
              ? <Link className="member-cards-link" to="/circles/$circleId/members/$memberId/cards" params={{ circleId, memberId: member.id }} aria-label={`View ${member.displayName}’s cards`}>
                <span className="circle-member-name">{member.displayName}<svg className="circle-member-link-icon" aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" /></svg><span className="circle-member-hint" aria-hidden="true">See their cards</span></span>
                {member.isAdmin && <span className="circle-admin">Admin</span>}
                <svg className="circle-member-chevron" aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
              </Link>
              : <><span>{member.displayName}</span>{member.isAdmin && <span className="circle-admin">Admin</span>}</>}
            {currentMember?.isAdmin && member.id !== currentMember.id && <CircleMemberRemoval circleId={circleId} member={member} />}
          </li>)}</ul>}
          {currentMember?.isAdmin && <CircleClearRemovals circleId={circleId} />}
        </section>
        {account.isPending ? <p role="status">Checking your circle access…</p> : account.isError ? <div role="alert"><p>We couldn’t check your circle access. Please try again.</p><Button variant="quiet" onClick={() => account.refetch()}>Try again</Button></div> : currentMember?.isAdmin && <div className="circle-management">
          <CircleInviteControls circleId={circleId} name={circle.data.name} />
          <CircleAdminSettings circle={circle.data} />
        </div>}
      </div>
      {account.isSuccess && currentMember && <CircleLeave key={circleId} circleId={circleId} name={circle.data.name} isAdmin={currentMember.isAdmin} memberCount={circle.data.members.length} />}
    </>}
  </section></PageFrame>;
}
