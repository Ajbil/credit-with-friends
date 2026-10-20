const ONBOARDED_INVITE_KEY = 'cwf.just-onboarded-invite';

export function rememberOnboardingInvite(returnPath: string | undefined) {
  try {
    sessionStorage.removeItem(ONBOARDED_INVITE_KEY);
    if (returnPath && /^\/circles\/join\/[^/?#\\]+$/.test(returnPath)) {
      sessionStorage.setItem(ONBOARDED_INVITE_KEY, returnPath);
    }
  } catch {
    // Storage can be blocked by browser privacy settings; cards remain optional.
  }
}

export function clearOnboardingInvite(unlessPath?: string) {
  try {
    if (!unlessPath || sessionStorage.getItem(ONBOARDED_INVITE_KEY) !== unlessPath) {
      sessionStorage.removeItem(ONBOARDED_INVITE_KEY);
    }
  } catch {
    // A blocked store must not interrupt joining a circle.
  }
}

export function destinationAfterInvite(invitePath: string, circlePath: string) {
  try {
    const savedPath = sessionStorage.getItem(ONBOARDED_INVITE_KEY);
    sessionStorage.removeItem(ONBOARDED_INVITE_KEY);
    if (savedPath === invitePath) return `/cards/welcome?returnTo=${encodeURIComponent(circlePath)}`;
  } catch {
    // If the one-time flag cannot be read and cleared, skip the invitation.
  }
  return circlePath;
}
