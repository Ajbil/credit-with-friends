import { Link } from '@tanstack/react-router';
import { PageFrame } from '../../../components/page-frame';

// Filled by the invite page and joining task.
export function JoinPage() {
  return <PageFrame><section className="narrow-page">
    <h1>Circle invite</h1>
    <p>Joining a circle is coming next.</p>
    <Link className="button button--quiet" to="/">Back to home</Link>
  </section></PageFrame>;
}
