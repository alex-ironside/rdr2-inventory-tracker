import { describe, it, expect } from 'vitest';
import { friendlyAuthError } from '../src/lib/auth-errors';

describe('friendlyAuthError', () => {
  it.each([
    ['auth/invalid-email', 'That email address looks invalid.'],
    ['auth/user-disabled', 'This account has been disabled.'],
    ['auth/user-not-found', 'Incorrect email or password.'],
    ['auth/wrong-password', 'Incorrect email or password.'],
    ['auth/invalid-credential', 'Incorrect email or password.'],
    ['auth/too-many-requests', 'Too many attempts. Please wait a moment and try again.'],
    ['auth/network-request-failed', 'Network error. Check your connection and try again.'],
    ['auth/email-already-in-use', 'An account already exists for that email. Try signing in.'],
    ['auth/weak-password', 'Please choose a stronger password (at least 6 characters).'],
    ['auth/requires-recent-login', 'Please re-enter your password to confirm this change.']
  ])('maps %s to a friendly message', (code, expected) => {
    expect(friendlyAuthError({ code })).toBe(expected);
  });

  it('falls back to the raw message for unknown codes', () => {
    expect(friendlyAuthError({ code: 'auth/other', message: 'boom' })).toBe('boom');
  });

  it('falls back to a generic message when there is no code or message', () => {
    expect(friendlyAuthError({})).toBe('Sign in failed.');
  });

  it('handles null / undefined safely', () => {
    expect(friendlyAuthError(null)).toBe('Sign in failed.');
    expect(friendlyAuthError(undefined)).toBe('Sign in failed.');
  });
});
