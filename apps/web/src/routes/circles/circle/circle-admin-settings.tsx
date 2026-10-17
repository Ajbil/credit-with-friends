import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { circleManageControllerDelete, circleManageControllerHandover, circleManageControllerRename, type ViewCircleDataDto } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { Button } from '../../../components/ui/button';
import { circleNameError } from '../home/circle-name.helper';

export function CircleAdminSettings({ circle }: { circle: ViewCircleDataDto }) {
  const client = useQueryClient();
  const nameInput = useRef<HTMLInputElement>(null);
  const [nameError, setNameError] = useState<string>();
  const [memberId, setMemberId] = useState('');
  const candidates = circle.members.filter((member) => !member.isAdmin);
  const target = candidates.find((member) => member.id === memberId);
  const handover = useMutation({
    networkMode: 'always', retry: false,
    mutationFn: (memberId: string) => circleManageControllerHandover(circle.id, { memberId }),
    // Reloading discards the old admin's cached invite link and permissions.
    onSuccess: () => { location.replace(`/circles/${circle.id}`); },
  });
  const remove = useMutation({
    networkMode: 'always', retry: false,
    mutationFn: () => circleManageControllerDelete(circle.id),
    // A fresh page drops cached memberships, member names and the dead invite link.
    onSuccess: () => { location.replace('/'); },
  });
  const rename = useMutation({
    networkMode: 'always', retry: false,
    mutationFn: (name: string) => circleManageControllerRename(circle.id, { name }),
    onMutate: () => client.cancelQueries({ queryKey: ['circle', circle.id] }),
    onSuccess: (response) => {
      const renamed = response.data.data!;
      client.setQueryData<ViewCircleDataDto>(['circle', circle.id], (current) => current && { ...current, name: renamed.name });
      return client.invalidateQueries({ queryKey: ['circles'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const field = error.failure.details?.fieldErrors?.find(({ field }) => field === 'name');
        if (field) {
          setNameError(field.reason === 'invalid_value' ? 'Use 1 to 40 characters.' : field.reason);
          nameInput.current?.focus();
        }
      }
    },
  });
  const busy = rename.isPending || handover.isPending || handover.isSuccess || remove.isPending || remove.isSuccess;
  const errors = [rename.error, handover.error, remove.error];
  const error = errors.find((error) => error instanceof ApiError && (error.status === 401 || error.failure.code === 'PRIVACY_NOTICE_REQUIRED'));
  if (error instanceof ApiError) {
    const returnTo = encodeURIComponent(`/circles/${circle.id}`);
    location.replace(`${error.status === 401 ? '/session' : '/notice'}?returnTo=${returnTo}`);
    return null;
  }
  const accessChanged = errors.find((error) => error instanceof ApiError && (error.failure.code === 'CIRCLE_ADMIN_ONLY' || error.failure.code === 'NOT_FOUND'));
  if (accessChanged) return <div className="circle-invite" style={{ marginTop: 24 }} role="alert">
    <p>Your access to this circle has changed. Reload the circle to see what’s available to you.</p>
    <Button variant="quiet" onClick={() => location.reload()}>Reload circle</Button>
  </div>;

  function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = nameInput.current?.value ?? '';
    const error = circleNameError(name);
    setNameError(error);
    rename.reset();
    if (error) { nameInput.current?.focus(); return; }
    rename.mutate(name.trim());
  }

  return <section className="circle-invite" style={{ marginTop: 24 }} aria-labelledby="circle-settings-heading">
    <h2 id="circle-settings-heading">Circle settings</h2>
    <form onSubmit={submitRename} noValidate>
      <label htmlFor="circle-rename-name">Circle name</label>
      <p id="circle-rename-help" className="field-help">Use 1 to 40 characters.</p>
      <input key={`${circle.id}:${circle.name}`} ref={nameInput} id="circle-rename-name" defaultValue={circle.name} required readOnly={busy} aria-invalid={!!nameError} aria-describedby={`circle-rename-help${nameError ? ' circle-rename-error' : ''}`} onChange={() => { setNameError(undefined); rename.reset(); }} />
      {nameError && <p id="circle-rename-error" className="field-error" role="alert">{nameError}</p>}
      <div className="circle-invite-actions"><Button type="submit" disabled={busy} aria-busy={rename.isPending}>{rename.isPending ? 'Saving…' : 'Rename circle'}</Button></div>
      {rename.isSuccess && <p className="circle-invite-feedback" role="status">Circle renamed.</p>}
      {rename.isError && !nameError && <p className="field-error" role="alert">We couldn’t rename this circle. Check your connection and try again.</p>}
    </form>
    <div className="circle-invite-reset">
      <h3>Hand over the admin role</h3>
      <p>The new admin will manage this circle and its invite link. You’ll stay as a member.</p>
      {candidates.length === 0 ? <p>Another member needs to join before you can hand over the admin role.</p> : <>
        <label htmlFor="circle-new-admin">New admin</label>
        <select id="circle-new-admin" value={target?.id ?? ''} disabled={busy} onChange={(event) => { setMemberId(event.target.value); handover.reset(); }} style={{ width: '100%', minHeight: 50, padding: '10px 13px', border: '1px solid var(--circle-muted)', borderRadius: 9, font: 'inherit', color: 'inherit', background: 'var(--circle-surface)' }}>
          <option value="">Choose a member</option>
          {candidates.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
        </select>
        <div className="circle-invite-actions"><Button variant="quiet" disabled={busy || !target} aria-busy={handover.isPending} onClick={() => {
          if (busy || !target) return;
          if (window.confirm(`Hand the admin role for “${circle.name}” to ${target.displayName}? You’ll stay as a member and lose all admin controls.`)) handover.mutate(target.id);
        }}>{handover.isPending || handover.isSuccess ? 'Handing over…' : 'Hand over admin role'}</Button></div>
      </>}
      {handover.isError && <p className="field-error" role="alert">{handover.error instanceof ApiError && handover.error.failure.code === 'HANDOVER_MEMBER_NOT_FOUND'
        ? 'This member is no longer in the circle. Reload the circle and choose another member.'
        : 'We couldn’t hand over the admin role. Check your connection and try again.'}</p>}
    </div>
    <div className="circle-invite-reset">
      <h3>Delete this circle</h3>
      <p>Deletion is permanent and cannot be undone. Everyone will lose access and the invite link will stop working.</p>
      <Button variant="quiet" disabled={busy} aria-busy={remove.isPending} onClick={() => {
        if (busy) return;
        if (window.confirm(`Delete “${circle.name}”? This is permanent and cannot be undone. Every membership will end and the invite link will stop working.`)) remove.mutate();
      }}>{remove.isPending || remove.isSuccess ? 'Deleting…' : 'Delete circle'}</Button>
      {remove.isError && <p className="field-error" role="alert">We couldn’t delete this circle. Check your connection and try again.</p>}
    </div>
  </section>;
}
