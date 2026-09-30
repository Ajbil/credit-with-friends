import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { accountsControllerCancel, accountsControllerNotice, accountsControllerOnboard, accountsControllerPending } from '../api/generated';
import { ApiError } from '../api/fetcher';
import { Button } from '../components/ui/button';
import { PageFrame } from '../components/page-frame';

export function OnboardingPage() {
  const pending = useQuery({ queryKey: ['pending'], queryFn: async () => (await accountsControllerPending()).data.data! });
  const notice = useQuery({ queryKey: ['notice'], queryFn: async () => (await accountsControllerNotice()).data.data!, enabled: pending.isSuccess });
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState('+91 ');
  const [isAdultConfirmed, setAdult] = useState(false);
  const [isConsentGiven, setConsent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const onboard = useMutation({ mutationFn: (input: Parameters<typeof accountsControllerOnboard>[0]) => accountsControllerOnboard(input), onSuccess: () => { location.assign(pending.data?.returnPath || '/'); }, onError: (error) => {
    if (error instanceof ApiError) setFieldErrors(Object.fromEntries((error.failure.details?.fieldErrors ?? []).map(({ field, reason }) => [field, reason === 'invalid_value' ? ({ displayName: 'Use 1 to 50 characters.', whatsappNumber: 'Enter a valid WhatsApp number.', isAdultConfirmed: 'Confirm you are 18 or older.', isConsentGiven: 'Accept the privacy notice to continue.' } as Record<string, string>)[field] ?? 'Check this value and try again.' : reason])));
  } });
  const cancel = useMutation({ mutationFn: accountsControllerCancel, onSuccess: () => { location.assign('/'); }, });
  const name = displayName ?? pending.data?.name ?? '';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notice.data) return;
    const trimmedName = name.trim();
    const phone = parsePhoneNumberFromString(whatsappNumber, 'IN');
    const errors = {
      ...(!trimmedName || trimmedName.length > 50 ? { displayName: 'Use 1 to 50 characters.' } : {}),
      ...(!phone?.isValid() ? { whatsappNumber: 'Enter a valid phone number with a country code.' } : {}),
      ...(!isAdultConfirmed ? { isAdultConfirmed: 'Confirm you are 18 or older.' } : {}),
      ...(!isConsentGiven ? { isConsentGiven: 'Accept the privacy notice to continue.' } : {}),
    };
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    onboard.mutate({ displayName: name, whatsappNumber, isAdultConfirmed, isConsentGiven, privacyNoticeVersion: notice.data.version });
  }

  if (pending.isPending) return <PageFrame><section className="narrow-page"><p role="status">Loading your sign-in…</p></section></PageFrame>;
  if (pending.error instanceof ApiError && pending.error.status === 401) return <PageFrame><section className="narrow-page"><h1>Your sign-in has ended</h1><p>Sign in with Google again to continue. Your details are safe.</p><a className="button button--primary" href="/">Go to sign in</a></section></PageFrame>;
  if (pending.isError) return <PageFrame><section className="narrow-page"><h1>We couldn't load your sign-in</h1><p>Please try again.</p><Button onClick={() => pending.refetch()}>Try again</Button></section></PageFrame>;

  return <PageFrame><section className="onboarding-layout"><div className="intro"><h1>Finish your account</h1><p>One quick step before you can connect with your circle.</p><p className="signed-in-as">Signed in as <strong>{pending.data.email}</strong></p></div><form className="onboarding-form" onSubmit={submit} noValidate>
    <label htmlFor="display-name">Name</label><p className="field-help">Use the name your friends know.</p><input id="display-name" autoComplete="name" value={name} onChange={(event) => setDisplayName(event.target.value)} required aria-invalid={!!fieldErrors.displayName} aria-describedby={fieldErrors.displayName ? 'name-error' : undefined}/>{fieldErrors.displayName && <p id="name-error" className="field-error">{fieldErrors.displayName}</p>}
    <label htmlFor="whatsapp">WhatsApp number</label><p className="field-help">Include a country code. India starts with +91.</p><input id="whatsapp" type="tel" autoComplete="tel" inputMode="tel" value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} required aria-invalid={!!fieldErrors.whatsappNumber} aria-describedby={fieldErrors.whatsappNumber ? 'phone-error' : undefined}/>{fieldErrors.whatsappNumber && <p id="phone-error" className="field-error">{fieldErrors.whatsappNumber}</p>}
    <label className="check-row"><input type="checkbox" checked={isAdultConfirmed} onChange={(event) => setAdult(event.target.checked)}/><span>I confirm I am 18 or older.</span></label>{fieldErrors.isAdultConfirmed && <p className="field-error">{fieldErrors.isAdultConfirmed}</p>}
    <section className="privacy-section" aria-labelledby="privacy-heading"><h2 id="privacy-heading">Your privacy</h2>{notice.isPending ? <p role="status">Loading the privacy notice…</p> : notice.isError ? <p role="alert" className="notice-error">The privacy notice is not available yet. Please try again later.</p> : <><div className="notice-text">{notice.data?.text}</div><label className="check-row"><input type="checkbox" checked={isConsentGiven} onChange={(event) => setConsent(event.target.checked)}/><span>I agree to the privacy notice.</span></label>{fieldErrors.isConsentGiven && <p className="field-error">{fieldErrors.isConsentGiven}</p>}</>}</section>
    {onboard.isError && <p role="alert" className="notice-error">{onboard.error instanceof ApiError && onboard.error.failure.code === 'VALIDATION_ERROR' ? 'Please check the highlighted details and try again.' : 'We couldn’t create your account. Please try again.'}</p>}
    {cancel.isError && <p role="alert" className="notice-error">We couldn’t remove your sign-in. Please try again.</p>}
    <Button type="submit" disabled={!notice.data || onboard.isPending || cancel.isPending}>{onboard.isPending ? 'Creating your account…' : 'Create my account'}</Button><Button type="button" variant="quiet" disabled={cancel.isPending || onboard.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Removing your sign-in…' : 'Cancel and remove my sign-in'}</Button>
  </form></section></PageFrame>;
}
