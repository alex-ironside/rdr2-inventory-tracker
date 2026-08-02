import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import IterationList from '../../src/components/IterationList.svelte';
import { session } from '../../src/lib/session.svelte';
import { LocalBackend, type StorageBackend } from '../../src/lib/storage';
import type { Iteration } from '../../src/lib/types';

/** In-memory backend that behaves like the Firestore backend for tests. */
function fakeCloud(): StorageBackend & { store: Record<string, Iteration> } {
  const store: Record<string, Iteration> = {};
  return {
    store,
    mode: 'firebase',
    async listIterations() {
      return Object.values(store)
        .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async getIteration(id) {
      return store[id] ?? null;
    },
    async createIteration(title) {
      const it: Iteration = {
        id: 'cloud1',
        title,
        createdAt: 1,
        updatedAt: 1,
        delivered: {},
        freeze: { cols: {}, rows: {} },
        history: []
      };
      store[it.id] = it;
      return it;
    },
    async updateTitle() {},
    async saveProgress() {},
    async deleteIteration(id) {
      delete store[id];
    },
    async putIteration(it) {
      store[it.id] = it;
    }
  };
}

beforeEach(() => {
  localStorage.clear();
  session.mode = 'local';
  session.backend = new LocalBackend();
  session.user = null;
});
afterEach(() => vi.restoreAllMocks());

describe('IterationList', () => {
  it('shows an empty state when there are no playthroughs', async () => {
    render(IterationList, { props: { onOpen: vi.fn() } });
    expect(await screen.findByText('No playthroughs yet')).toBeInTheDocument();
  });

  it('creates a playthrough and opens it', async () => {
    const onOpen = vi.fn();
    render(IterationList, { props: { onOpen } });
    await screen.findByText('No playthroughs yet');
    await fireEvent.input(screen.getByPlaceholderText(/New playthrough title/i), {
      target: { value: 'Honor Run' }
    });
    await fireEvent.click(screen.getByRole('button', { name: /New Playthrough/i }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledOnce());
  });

  it('lists existing playthroughs with created/updated dates', async () => {
    await session.backend!.createIteration('Existing Run');
    render(IterationList, { props: { onOpen: vi.fn() } });
    expect(await screen.findByText('Existing Run')).toBeInTheDocument();
    expect(screen.getByText(/Created .* · Updated/)).toBeInTheDocument();
  });

  it('deletes a playthrough after confirmation', async () => {
    await session.backend!.createIteration('Doomed');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(IterationList, { props: { onOpen: vi.fn() } });
    await screen.findByText('Doomed');
    await fireEvent.click(screen.getByLabelText('Delete playthrough'));
    await waitFor(() => expect(screen.queryByText('Doomed')).not.toBeInTheDocument());
  });

  it('does not delete when the confirmation is cancelled', async () => {
    await session.backend!.createIteration('Survivor');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(IterationList, { props: { onOpen: vi.fn() } });
    await screen.findByText('Survivor');
    await fireEvent.click(screen.getByLabelText('Delete playthrough'));
    // Still present.
    expect(screen.getByText('Survivor')).toBeInTheDocument();
  });

  it('surfaces a load error', async () => {
    vi.spyOn(session.backend!, 'listIterations').mockRejectedValue(new Error('offline'));
    render(IterationList, { props: { onOpen: vi.fn() } });
    expect(await screen.findByText('offline')).toBeInTheDocument();
  });

  it('surfaces a create error', async () => {
    vi.spyOn(session.backend!, 'createIteration').mockRejectedValue(new Error('nope'));
    render(IterationList, { props: { onOpen: vi.fn() } });
    await screen.findByText('No playthroughs yet');
    await fireEvent.click(screen.getByRole('button', { name: /New Playthrough/i }));
    expect(await screen.findByText('nope')).toBeInTheDocument();
  });

  it('shows the user email when signed into Firebase', async () => {
    session.mode = 'firebase';
    session.backend = fakeCloud();
    session.user = { email: 'me@example.com' } as never;
    render(IterationList, { props: { onOpen: vi.fn() } });
    expect(await screen.findByText('me@example.com')).toBeInTheDocument();
  });

  describe('offline → cloud sync', () => {
    beforeEach(async () => {
      // Seed a local (offline) playthrough on this device, then sign into cloud.
      await new LocalBackend().createIteration('Offline Run');
      session.mode = 'firebase';
      session.backend = fakeCloud();
      session.user = { email: 'me@example.com' } as never;
    });

    it('offers to sync local playthroughs and performs the sync', async () => {
      render(IterationList, { props: { onOpen: vi.fn() } });
      const syncBtn = await screen.findByRole('button', { name: /Sync 1 to cloud/i });
      await fireEvent.click(syncBtn);
      expect(await screen.findByText(/Synced 1 playthrough to the cloud/i)).toBeInTheDocument();
    });

    it('pluralises the banner and result for multiple local playthroughs', async () => {
      await new LocalBackend().createIteration('Second Offline Run');
      render(IterationList, { props: { onOpen: vi.fn() } });
      // Banner uses the plural form.
      expect(await screen.findByText(/2 playthroughs saved offline/i)).toBeInTheDocument();
      await fireEvent.click(screen.getByRole('button', { name: /Sync 2 to cloud/i }));
      expect(await screen.findByText(/Synced 2 playthroughs to the cloud/i)).toBeInTheDocument();
    });

    it('hides the sync banner when local data cannot be read', async () => {
      vi.spyOn(LocalBackend.prototype, 'listIterations').mockRejectedValue(new Error('blocked'));
      render(IterationList, { props: { onOpen: vi.fn() } });
      await screen.findByText('me@example.com');
      expect(screen.queryByRole('button', { name: /Sync/i })).not.toBeInTheDocument();
    });

    it('reports a sync failure', async () => {
      vi.spyOn(session.backend!, 'putIteration').mockRejectedValue(new Error('quota'));
      render(IterationList, { props: { onOpen: vi.fn() } });
      const syncBtn = await screen.findByRole('button', { name: /Sync 1 to cloud/i });
      await fireEvent.click(syncBtn);
      expect(await screen.findByText(/Sync failed: quota/i)).toBeInTheDocument();
    });
  });
});
