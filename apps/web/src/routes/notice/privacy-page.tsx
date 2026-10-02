import { useQuery } from '@tanstack/react-query';
import { accountsControllerNotice } from '../../api/generated';
import { PageFrame } from '../../components/page-frame';
import { Button } from '../../components/ui/button';
import './notice.css';

export function PrivacyPage() {
  const notice = useQuery({ queryKey: ['notice'], queryFn: async () => (await accountsControllerNotice()).data.data! });
  return <PageFrame><section className="notice-layout">
    <h1>Privacy notice</h1>
    {notice.isPending ? <p role="status">Loading the privacy notice…</p> : notice.isError ? <><h2>We couldn't load the privacy notice</h2><p>Please try again.</p><Button onClick={() => notice.refetch()}>Try again</Button></> : <div className="notice-full-text">{notice.data.text}</div>}
  </section></PageFrame>;
}
