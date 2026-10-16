import { useMutation, useQueryClient } from '@tanstack/react-query';
import { circleRemovalsControllerClear, circleRemovalsControllerRemove, type CircleMemberDto, type ViewCircleDataDto } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { Button } from '../../../components/ui/button';

export function CircleMemberRemoval({ circleId, member }: { circleId: string; member: CircleMemberDto }) {
  const client = useQueryClient();
  const remove = useMutation({
    networkMode: 'always', retry: false,
    mutationFn: () => circleRemovalsControllerRemove(circleId, member.id),
    onSuccess: async () => {
      // Retire the name immediately, including if refreshing the circle fails.
      await client.cancelQueries({ queryKey: ['circle', circleId] });
      client.setQueryData<ViewCircleDataDto>(['circle', circleId], (circle) => circle && ({ ...circle, members: circle.members.filter(({ id }) => id !== member.id) }));
      void client.invalidateQueries({ queryKey: ['circle', circleId] });
      void client.invalidateQueries({ queryKey: ['circles'] });
    },
  });
  if (remove.error instanceof ApiError && (remove.error.status === 401 || remove.error.failure.code === 'PRIVACY_NOTICE_REQUIRED')) {
    const returnTo = encodeURIComponent(`/circles/${circleId}`);
    location.replace(`${remove.error.status === 401 ? '/session' : '/notice'}?returnTo=${returnTo}`);
    return null;
  }

  return <div style={{ maxWidth: '60%', textAlign: 'right' }}>
    <Button variant="quiet" aria-label={`Remove ${member.displayName}`} aria-busy={remove.isPending} disabled={remove.isPending || remove.isSuccess} onClick={() => {
      if (remove.isPending || remove.isSuccess) return;
      if (window.confirm(`Remove “${member.displayName}” from this circle? They’ll lose access immediately and can’t rejoin until you use Clear all removals. They’ll then need a valid invite link and must tap Join.`)) remove.mutate();
    }}>{remove.isPending || remove.isSuccess ? 'Removing…' : 'Remove'}</Button>
    {remove.isError && <div className="field-error" role="alert" style={{ fontWeight: 400, textAlign: 'left' }}>{remove.error instanceof ApiError ? remove.error.message : 'We couldn’t remove this member. Check your connection and try again.'}</div>}
  </div>;
}

export function CircleClearRemovals({ circleId }: { circleId: string }) {
  const clear = useMutation({ networkMode: 'always', retry: false, mutationFn: () => circleRemovalsControllerClear(circleId) });
  if (clear.error instanceof ApiError && (clear.error.status === 401 || clear.error.failure.code === 'PRIVACY_NOTICE_REQUIRED')) {
    const returnTo = encodeURIComponent(`/circles/${circleId}`);
    location.replace(`${clear.error.status === 401 ? '/session' : '/notice'}?returnTo=${returnTo}`);
    return null;
  }

  return <section className="circle-leave" aria-label="Clear removals">
    <h2>Let removed people rejoin</h2>
    <p>Clear all removals to let anyone you removed join again through a valid invite link. Nobody is added back automatically.</p>
    <Button variant="quiet" aria-busy={clear.isPending} disabled={clear.isPending} onClick={() => {
      if (clear.isPending) return;
      if (window.confirm('Clear all removals? This lets every removed person rejoin through a valid invite link by tapping Join. This can’t be undone. Nobody is added back automatically.')) clear.mutate();
    }}>{clear.isPending ? 'Clearing…' : 'Clear all removals'}</Button>
    {clear.isSuccess && <p role="status" style={{ marginTop: 16 }}>All removals cleared. People can rejoin through a valid invite link by tapping Join.</p>}
    {clear.isError && <div className="field-error" role="alert">{clear.error instanceof ApiError ? clear.error.message : 'We couldn’t clear removals. Check your connection and try again.'}</div>}
  </section>;
}
