import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { accountsControllerMe, sessionsControllerSignOut, type MemberDataDto } from '../../api/generated';
import { apiFetch, ApiError } from '../../api/fetcher';
import { Button } from '../../components/ui/button';
import { PageFrame } from '../../components/page-frame';
import './profile.css';

export function ProfilePage() {
  const client = useQueryClient();
  const member = useQuery({ queryKey: ['member'], queryFn: async () => (await accountsControllerMe()).data.data! });
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({ mutationFn: (input: { displayName: string; whatsappNumber: string }) => apiFetch<{ data: { data: MemberDataDto } }>('/api/v1/members/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }), onSuccess: (result) => {
    client.setQueryData(['member'], result.data.data);
    setName(null);
    setPhone(null);
    setErrors({});
  }, onError: (error) => {
    if (error instanceof ApiError && error.status === 401) { location.replace('/session'); return; }
    if (error instanceof ApiError && error.failure.code === 'PRIVACY_NOTICE_REQUIRED') { location.replace('/notice?returnTo=/profile'); return; }
    if (error instanceof ApiError) setErrors(Object.fromEntries((error.failure.details?.fieldErrors ?? []).map(({ field, reason }) => [field, reason])));
  } });
  const signOut = useMutation({ mutationFn: sessionsControllerSignOut, onSuccess: () => { client.clear(); location.replace('/'); } });

  if (member.isPending) return <PageFrame><section className="profile-layout"><p role="status">Loading your profile…</p></section></PageFrame>;
  if (member.error instanceof ApiError && member.error.status === 401) { location.replace('/session'); return null; }
  if (member.error instanceof ApiError && member.error.failure.code === 'PRIVACY_NOTICE_REQUIRED') { location.replace('/notice?returnTo=/profile'); return null; }
  if (member.isError) return <PageFrame><section className="profile-layout"><h1>We couldn't load your profile</h1><p>Please try again.</p><Button onClick={() => member.refetch()}>Try again</Button></section></PageFrame>;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!member.data) return;
    const displayName = name ?? member.data.displayName;
    const whatsappNumber = phone ?? member.data.whatsappE164;
    const parsed = parsePhoneNumberFromString(whatsappNumber, 'IN');
    const next = {
      ...(!displayName.trim() || displayName.trim().length > 50 ? { displayName: 'Use 1 to 50 characters.' } : {}),
      ...(!parsed?.isValid() ? { whatsappNumber: 'Enter a valid phone number with a country code.' } : {}),
    };
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({ displayName, whatsappNumber });
  }

  return <PageFrame><section className="profile-layout"><h1>Your profile</h1><p>Your name and WhatsApp number help people in your circles reach you.</p>
    <form className="profile-form" onSubmit={submit} noValidate>
      <label htmlFor="profile-name">Name</label><input id="profile-name" autoComplete="name" value={name ?? member.data.displayName} onChange={(event) => setName(event.target.value)} aria-invalid={!!errors.displayName} aria-describedby={errors.displayName ? 'profile-name-error' : undefined}/>{errors.displayName && <p id="profile-name-error" className="field-error">{errors.displayName}</p>}
      <label htmlFor="profile-phone">WhatsApp number</label><input id="profile-phone" type="tel" autoComplete="tel" inputMode="tel" value={phone ?? member.data.whatsappE164} onChange={(event) => setPhone(event.target.value)} aria-invalid={!!errors.whatsappNumber} aria-describedby={errors.whatsappNumber ? 'profile-phone-error' : undefined}/>{errors.whatsappNumber && <p id="profile-phone-error" className="field-error">{errors.whatsappNumber}</p>}
      <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
      {save.isSuccess && <p role="status">Your changes are saved.</p>}
      {save.isError && <p role="alert" className="field-error">{Object.keys(errors).length ? 'Please check the highlighted details and try again.' : 'We couldn’t save your changes. Please try again.'}</p>}
    </form>
    <section className="profile-private" aria-labelledby="private-heading"><h2 id="private-heading">Only you can see these</h2><dl><dt>Google email</dt><dd>{member.data.googleEmail}</dd><dt>Google account ID</dt><dd>{member.data.googleAccountId}</dd></dl><p>Use your Google account ID for the owner setting.</p></section>
    <div className="profile-signout"><Button variant="quiet" disabled={signOut.isPending} onClick={() => signOut.mutate()}>Sign out of this device</Button>{signOut.isError && <p role="alert" className="field-error">We couldn’t sign you out. Please try again.</p>}</div>
  </section></PageFrame>;
}
