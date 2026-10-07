import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { createCircleControllerCreate, listCirclesControllerList } from '../../../api/generated';
import { ApiError } from '../../../api/fetcher';
import { Button } from '../../../components/ui/button';
import { PageFrame } from '../../../components/page-frame';
import { circleNameError } from './circle-name.helper';
import './home.css';

export function CirclesHomePage() {
  const client = useQueryClient();
  // A member can belong to at most 20 circles, so one API page contains the whole list.
  const circles = useQuery({ queryKey: ['circles'], networkMode: 'always', queryFn: async () => (await listCirclesControllerList({ page: 1, limit: 20 })).data.data! });
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string>();
  const nameInput = useRef<HTMLInputElement>(null);
  const create = useMutation({
    networkMode: 'always',
    mutationFn: () => createCircleControllerCreate({ name: name.trim() }),
    onSuccess: () => {
      setName('');
      setNameError(undefined);
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

  const error = [circles.error, create.error].find((error) => error instanceof ApiError && (error.status === 401 || error.failure.code === 'PRIVACY_NOTICE_REQUIRED'));
  if (error instanceof ApiError) {
    location.replace(error.status === 401 ? '/session?returnTo=/' : '/notice?returnTo=/');
    return null;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    const error = circleNameError(name);
    setNameError(error);
    create.reset();
    if (error) { nameInput.current?.focus(); return; }
    create.mutate();
  }

  return <PageFrame><section className="circles-home">
    <header className="circles-header">
      <div><h1>Your circles</h1><p>The groups of people you trust.</p></div>
      <Link className="button button--quiet" to="/profile">Your profile</Link>
    </header>
    <div className="circles-layout">
      <section className="circles-list-region" aria-label="Your circle memberships">
        {circles.isPending ? <p role="status">Loading your circles…</p> : circles.isError ? <div role="alert">
          <h2>We couldn’t load your circles</h2><p>Please try again to see your groups.</p>
          <Button variant="quiet" onClick={() => circles.refetch()}>Try again</Button>
        </div> : circles.data.items.length === 0 ? <div className="circles-empty">
          <h2>No circles yet</h2><p>A circle brings your family, friends or colleagues together. Give your first circle a name to get started.</p>
        </div> : <ul className="circles-list" aria-label="Your circles">{circles.data.items.map((circle) => <li key={circle.id}>
          <Link to="/circles/$circleId" params={{ circleId: circle.id }}>
            <span className="circle-name">{circle.name}</span>
            <span className="circle-summary">{new Intl.NumberFormat('en-IN').format(circle.memberCount)} {circle.memberCount === 1 ? 'member' : 'members'}{circle.isAdmin ? ' · You’re the admin' : ''}</span>
          </Link>
        </li>)}</ul>}
      </section>
      <form className="circle-create-form" onSubmit={submit} noValidate aria-labelledby="create-circle-heading">
        <h2 id="create-circle-heading">Create a circle</h2>
        <p>You’ll be its first member and admin.</p>
        <label htmlFor="circle-name">Circle name</label>
        <p id="circle-name-help" className="field-help">Use 1 to 40 characters. For example, College batch.</p>
        <input ref={nameInput} id="circle-name" value={name} required readOnly={create.isPending} aria-invalid={!!nameError} aria-describedby={`circle-name-help${nameError ? ' circle-name-error' : ''}`} onChange={(event) => { setName(event.target.value); setNameError(undefined); create.reset(); }}/>
        {nameError && <p id="circle-name-error" className="field-error" role="alert">{nameError}</p>}
        <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating circle…' : 'Create circle'}</Button>
        {create.isSuccess && <p className="circle-create-status" role="status">Your circle is created. It’s in your list.</p>}
        {create.isError && !nameError && <p role="alert" className="field-error">We couldn’t create your circle. Please try again.</p>}
      </form>
    </div>
  </section></PageFrame>;
}
