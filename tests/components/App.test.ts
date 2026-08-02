import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import App from '../../src/App.svelte';
import { session } from '../../src/lib/session.svelte';
import { LocalBackend } from '../../src/lib/storage';

beforeEach(() => {
  localStorage.clear();
  session.ready = true;
  session.mode = null;
  session.backend = null;
  session.user = null;
  session.firebaseAvailable = false;
});
afterEach(() => vi.restoreAllMocks());

describe('App shell routing', () => {
  it('shows a splash while the session is not ready', () => {
    session.ready = false;
    render(App);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the login screen when unauthenticated', () => {
    render(App);
    expect(screen.getByRole('button', { name: /Continue offline/i })).toBeInTheDocument();
  });

  it('shows the playthrough list when authenticated', async () => {
    session.mode = 'local';
    session.backend = new LocalBackend();
    render(App);
    expect(await screen.findByText('Your Playthroughs')).toBeInTheDocument();
  });

  it('opens a playthrough then returns to login on sign-out', async () => {
    session.mode = 'local';
    session.backend = new LocalBackend();
    await session.backend.createIteration('Run One');
    render(App);

    await fireEvent.click(await screen.findByText('Run One'));
    // Tracker view is now open.
    expect(await screen.findByRole('button', { name: /Inventory Tracker/ })).toBeInTheDocument();

    // The back button returns to the playthrough list.
    await fireEvent.click(screen.getByTitle('Back to playthroughs'));
    expect(await screen.findByText('Your Playthroughs')).toBeInTheDocument();

    // Re-open, then lose authentication.
    await fireEvent.click(await screen.findByText('Run One'));
    await screen.findByRole('button', { name: /Inventory Tracker/ });

    // Losing authentication drops back to the login screen.
    session.mode = null;
    session.backend = null;
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Continue offline/i })).toBeInTheDocument()
    );
  });
});
