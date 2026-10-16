import { useMutation } from '@tanstack/react-query';
import { leaveCircleControllerLeave } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { Button } from '../../../components/ui/button';

export function CircleLeave({ circleId, name, isAdmin, memberCount }: { circleId: string; name: string; isAdmin: boolean; memberCount: number }) {
  const leave = useMutation({
    networkMode: 'always', retry: false,
    mutationFn: () => leaveCircleControllerLeave(circleId),
    // A fresh page also discards cached member names, invite links and the old circles list.
    onSuccess: () => { location.replace('/'); },
  });
  if (leave.error instanceof ApiError && (leave.error.status === 401 || leave.error.failure.code === 'PRIVACY_NOTICE_REQUIRED')) {
    const returnTo = encodeURIComponent(`/circles/${circleId}`);
    location.replace(`${leave.error.status === 401 ? '/session' : '/notice'}?returnTo=${returnTo}`);
    return null;
  }

  function confirmLeave() {
    if (leave.isPending || leave.isSuccess) return;
    const warning = memberCount === 1
      ? ' You’re the last member, so the circle will be deleted and its invite link will stop working.'
      : isAdmin ? ' The admin role will pass to the earliest-joined remaining member.' : '';
    const rejoin = memberCount === 1 ? '' : ' You can join again later through a valid invite link.';
    if (window.confirm(`Leave “${name}”?${warning}${rejoin}`)) leave.mutate();
  }

  return <div className="circle-leave">
    <Button variant="quiet" disabled={leave.isPending || leave.isSuccess} aria-busy={leave.isPending} onClick={confirmLeave}>{leave.isPending || leave.isSuccess ? 'Leaving…' : 'Leave circle'}</Button>
    {leave.isError && <p className="field-error" role="alert">{leave.error instanceof ApiError && leave.error.status === 404
      ? 'This circle is no longer available to you. Go back to your circles.'
      : 'We couldn’t leave this circle. Check your connection and try again.'}</p>}
  </div>;
}
