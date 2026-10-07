import { Link } from '@tanstack/react-router';
import { PageFrame } from '../../../components/page-frame';

// Filled by the circle screen and invite-controls task.
export function CirclePage() {
  return <PageFrame><section className="narrow-page">
    <h1>Circle</h1>
    <p>The circle screen is coming next.</p>
    <Link className="button button--quiet" to="/">Back to your circles</Link>
  </section></PageFrame>;
}
