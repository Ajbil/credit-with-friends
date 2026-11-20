import { useId } from 'react';
import { useMutation } from '@tanstack/react-query';
import { contactsControllerContact } from '../api/generated';
import { ApiError } from '../api/fetcher';
import { Button } from './ui/button';
import './whatsapp-contact.css';

const CONTACT_TIMEOUT_MS = 15_000;

export function ContactReminder() {
  return <aside className="contact-reminder">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v2" /></svg>
    <p>The card holder places the order themselves. <strong>Never share card numbers, CVV, expiry dates or OTPs.</strong></p>
  </aside>;
}

export function WhatsAppContact({ cardId, returnTo }: { cardId: string; returnTo: string }) {
  const errorId = useId();
  const contact = useMutation({
    networkMode: 'always', retry: false,
    mutationFn: async () => (await contactsControllerContact({ cardId }, { signal: AbortSignal.timeout(CONTACT_TIMEOUT_MS) })).data.data!,
    onSuccess: (data) => window.location.assign(data.whatsappUrl),
  });
  const unavailable = contact.error instanceof ApiError && contact.error.failure.code === 'CARD_UNAVAILABLE';

  if (contact.error instanceof ApiError && (contact.error.status === 401 || contact.error.failure.code === 'PRIVACY_NOTICE_REQUIRED')) {
    location.replace(`${contact.error.status === 401 ? '/session' : '/notice'}?returnTo=${encodeURIComponent(returnTo)}`);
    return null;
  }

  return <>
    <Button className="contact-whatsapp" type="button" disabled={contact.isPending || unavailable} aria-busy={contact.isPending} aria-describedby={contact.isError ? errorId : undefined} onClick={() => { if (!contact.isPending && !unavailable) contact.mutate(); }}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5A8 8 0 1 1 21 12z" /></svg>
      {contact.isPending ? 'Opening WhatsApp…' : 'Message on WhatsApp'}
    </Button>
    {contact.isError && <p className="contact-error" role="alert" id={errorId}>{unavailable ? 'This card is no longer available.' : "We couldn't open WhatsApp. Check your connection and try again."}</p>}
  </>;
}
