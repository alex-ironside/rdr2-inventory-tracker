import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import App from '../../src/App.svelte';
import { session } from '../../src/lib/session.svelte';

// Behavioural integration test: drives the whole App the way a user would, with
// the real session store and real localStorage persistence — no mocked backend.
// Covers the end-to-end offline journey: choose offline → create → edit →
// autosave → navigate away → reopen and confirm the data survived.

beforeEach(() => {
  localStorage.clear();
  // Reset the shared session singleton to a signed-out, offline-capable state.
  session.ready = true;
  session.mode = null;
  session.backend = null;
  session.user = null;
  session.firebaseAvailable = false;
});
afterEach(() => vi.restoreAllMocks());

describe('offline user journey', () => {
  it('creates a playthrough, records progress and persists it across reopen', async () => {
    const { unmount } = render(App);

    // Choose offline mode from the login screen.
    await fireEvent.click(screen.getByRole('button', { name: /Continue offline/i }));
    expect(await screen.findByText('Your Playthroughs')).toBeInTheDocument();

    // Create a playthrough.
    await fireEvent.input(screen.getByPlaceholderText(/New playthrough title/i), {
      target: { value: 'Integration Run' }
    });
    await fireEvent.click(screen.getByRole('button', { name: /New Playthrough/i }));

    // Tracker opens; record two deliveries of Alligator Skin for Camp.
    await screen.findByRole('button', { name: /Inventory Tracker/ });
    const row = screen.getByText('Alligator Skin').closest('tr')!;
    const inc = within(row).getByLabelText('Increase Alligator Skin — Camp delivered');
    await fireEvent.click(inc);
    await fireEvent.click(inc);
    expect(await screen.findByText('✓ Saved')).toBeInTheDocument();

    // Navigate back to the list, then simulate a fresh page load by remounting
    // the App against the same (persisted) localStorage.
    await fireEvent.click(screen.getByTitle('Back to playthroughs'));
    await screen.findByText('Integration Run');
    unmount();

    render(App);
    // Offline mode is remembered, so we land straight on the list.
    await fireEvent.click(await screen.findByText('Integration Run'));
    const reopenedRow = (await screen.findByText('Alligator Skin')).closest('tr')!;
    const input = within(reopenedRow).getByRole('spinbutton', {
      name: /Alligator Skin — Camp delivered/
    }) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('2'));
  });
});
