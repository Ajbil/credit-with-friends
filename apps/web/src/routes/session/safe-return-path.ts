export function safeReturnPath(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/profile';
  try {
    const url = new URL(value, location.origin);
    return url.origin === location.origin && url.pathname.startsWith('/') && !url.pathname.startsWith('//')
      ? `${url.pathname}${url.search}${url.hash}` : '/profile';
  } catch {
    return '/profile';
  }
}
