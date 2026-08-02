// Maps Firebase Auth error codes to short, human-friendly messages.
// Pure and isolated so it is trivially unit-testable.

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.'
};

export function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string } | null | undefined)?.code ?? '';
  if (code && MESSAGES[code]) return MESSAGES[code];
  const message = (err as { message?: string } | null | undefined)?.message;
  return message ?? 'Sign in failed.';
}
