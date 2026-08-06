import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import Login from '../../src/components/Login.svelte';
import { session } from '../../src/lib/session.svelte';

beforeEach(() => {
  session.authError = null;
  session.mode = null;
  session.firebaseAvailable = true;
});
afterEach(() => vi.restoreAllMocks());

describe('Login', () => {
  it('shows the sign-in form when Firebase is available', () => {
    render(Login);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('submits credentials to session.signIn', async () => {
    const spy = vi.spyOn(session, 'signIn').mockResolvedValue(true);
    render(Login);
    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(spy).toHaveBeenCalledWith('a@b.c', 'secret');
  });

  it('shows an auth error message from the session', async () => {
    vi.spyOn(session, 'signIn').mockImplementation(async () => {
      session.authError = 'Incorrect email or password.';
      return false;
    });
    render(Login);
    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'bad' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Incorrect email or password.')
    );
  });

  it('shows a busy state and ignores repeat submits while signing in', async () => {
    let resolveSignIn: (v: boolean) => void = () => {};
    const spy = vi.spyOn(session, 'signIn').mockImplementation(
      () =>
        new Promise<boolean>((res) => {
          resolveSignIn = res;
        })
    );
    render(Login);
    const form = screen.getByRole('button', { name: 'Sign In' }).closest('form')!;
    await fireEvent.submit(form);
    // Button now reflects the busy state.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Signing in…' })).toBeInTheDocument()
    );
    // A second submit while busy must not call signIn again.
    await fireEvent.submit(form);
    expect(spy).toHaveBeenCalledTimes(1);
    resolveSignIn(true);
  });

  it('offers offline mode and enters it on click', async () => {
    const spy = vi.spyOn(session, 'enterLocalMode').mockImplementation(() => {});
    render(Login);
    await fireEvent.click(screen.getByRole('button', { name: /Continue offline/i }));
    expect(spy).toHaveBeenCalledOnce();
  });

  it('hides the form and explains offline-only when Firebase is not configured', () => {
    session.firebaseAvailable = false;
    render(Login);
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.getByText(/still track everything locally/i)).toBeInTheDocument();
  });

  it('switches to register mode and discloses the paid Pro model before signing up', async () => {
    render(Login);
    await fireEvent.click(screen.getByRole('button', { name: /Create an account/i }));

    // The paid disclosure is visible BEFORE the user can register.
    expect(screen.getByText(/Cloud sync is a paid Pro subscription/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create free account/i })).toBeInTheDocument();
  });

  it('registers a new account via session.signUp', async () => {
    const spy = vi.spyOn(session, 'signUp').mockResolvedValue(true);
    render(Login);
    await fireEvent.click(screen.getByRole('button', { name: /Create an account/i }));
    await fireEvent.input(screen.getByLabelText('Email'), { target: { value: 'new@b.c' } });
    await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret1' } });
    await fireEvent.click(screen.getByRole('button', { name: /Create free account/i }));
    expect(spy).toHaveBeenCalledWith('new@b.c', 'secret1');
  });

  it('can switch back from register to sign in', async () => {
    render(Login);
    await fireEvent.click(screen.getByRole('button', { name: /Create an account/i }));
    await fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.queryByText(/paid Pro subscription/i)).not.toBeInTheDocument();
  });
});
