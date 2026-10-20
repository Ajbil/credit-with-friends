import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate } from '@tanstack/react-router';
import { banksControllerList, myCardsControllerAdd } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { PageFrame } from '../../../components/page-frame';
import { CardForm, CardReminder, type CardValues } from './card-form';

function returnPath() {
  const value = new URLSearchParams(location.search).get('returnTo');
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/cards';
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : '/cards';
  } catch {
    return '/cards';
  }
}

export function AddCardPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const banks = useQuery({ queryKey: ['banks'], networkMode: 'always', queryFn: async () => (await banksControllerList({ page: 1, limit: 100 })).data.data! });
  const ready = banks.isSuccess && banks.data.items.length > 0;
  const [values, setValues] = useState<CardValues>({ pickerValue: '', bankId: '', type: 'credit', variant: '' });
  const { bankId, type, variant } = values;
  const saved = useRef(false);
  const save = useMutation({
    networkMode: 'always',
    mutationFn: () => myCardsControllerAdd({ bankId, type, variant: variant.trim() }),
    onSuccess: async () => {
      saved.current = true;
      await client.invalidateQueries({ queryKey: ['my-cards'] });
      await navigate({ to: returnPath(), ignoreBlocker: true });
    },
  });
  const dirty = !!bankId || type !== 'credit' || !!variant;
  useBlocker({
    shouldBlockFn: () => dirty && !saved.current && !window.confirm('Leave without saving this card?'),
    enableBeforeUnload: () => dirty && !saved.current,
  });

  useEffect(() => {
    document.title = 'Add a card | CreditWithFriends';
    return () => { document.title = 'CreditWithFriends'; };
  }, []);

  const authError = [banks.error, save.error].find((error) => error instanceof ApiError && (error.status === 401 || error.failure.code === 'PRIVACY_NOTICE_REQUIRED'));
  if (authError instanceof ApiError) {
    saved.current = true;
    location.replace(`${authError.status === 401 ? '/session' : '/notice'}?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
    return null;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !bankId || save.isPending) return;
    save.mutate();
  }

  return <PageFrame><section className="cards-page card-add-page">
    <Link className="button button--quiet" to="/cards">Back to your cards</Link>
    <header className="cards-header"><h1>Add a card</h1><p>Choose your bank or a brand card, then check the details.</p></header>
    <CardReminder />
    <CardForm banks={banks} values={values} onChange={(next) => { setValues(next); save.reset(); }} onSubmit={submit} saving={save.isPending} error={save.error} label="Add a card" />
  </section></PageFrame>;
}
