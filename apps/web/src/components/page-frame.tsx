import type { ReactNode } from 'react';

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="page-frame"><header className="site-header"><a className="brand" href="/" aria-label="CreditWithFriends home"><span className="brand-mark" aria-hidden="true">C</span><span>CreditWithFriends</span></a></header><main className="main-content">{children}</main><footer className="site-footer"><p>A small circle. A useful connection.</p><p>Questions or concerns? Write to us at <a href="mailto:support.creditwithfriends@gmail.com">support.creditwithfriends@gmail.com</a>. We reply within 24 hours.</p></footer></div>;
}
