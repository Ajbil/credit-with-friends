import type { ReactNode } from 'react';

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="page-frame"><header className="site-header"><a className="brand" href="/" aria-label="CreditWithFriends home"><span className="brand-mark" aria-hidden="true">C</span><span>CreditWithFriends</span></a></header><main className="main-content">{children}</main><footer className="site-footer">A small circle. A useful connection.</footer></div>;
}
