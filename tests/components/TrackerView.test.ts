import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import * as XLSX from '@e965/xlsx';
import TrackerView from '../../src/components/TrackerView.svelte';
import { session } from '../../src/lib/session.svelte';
import { LocalBackend } from '../../src/lib/storage';
import { SHEETS } from '../../src/lib/seed';
import type { DeliveredMap } from '../../src/lib/types';

/** Build a real inventory .xlsx File (with an arrayBuffer() jsdom shim). */
function inventoryXlsx(rows: unknown[][]): File {
  const header = [
    'Material',
    'Biome / Location',
    'You Have',
    'Satchels',
    'Camp',
    'Trapper Clothes',
    'Trapper Saddles'
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), 'Inventory Tracker');
  const written = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
  const ab = written instanceof Uint8Array ? written.buffer : written;
  const file = new File([ab], 'tracker.xlsx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => ab });
  return file;
}

async function makeIteration(title = 'Test Run') {
  const it = await session.backend!.createIteration(title);
  return it.id;
}

/** Build a delivered map that fully satisfies one sheet (for the "done" tab). */
function fullDelivered(sheetId: string): DeliveredMap {
  const sheet = SHEETS.find((s) => s.id === sheetId)!;
  const map: DeliveredMap = { [sheetId]: {} };
  for (const row of sheet.rows) {
    if (row.section || !row.cells) continue;
    for (const col of sheet.columns) {
      const req = row.cells[col.key]?.required;
      if (req != null && (col.type === 'tracked' || col.type === 'bool')) {
        map[sheetId][row.id] ??= {};
        map[sheetId][row.id][col.key] = req;
      }
    }
  }
  return map;
}

beforeEach(() => {
  localStorage.clear();
  session.mode = 'local';
  session.backend = new LocalBackend();
});
afterEach(() => vi.restoreAllMocks());

describe('TrackerView', () => {
  it('loads an iteration, showing its title, tabs and update time', async () => {
    const id = await makeIteration('My Playthrough');
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    expect(await screen.findByText('My Playthrough')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Inventory Tracker/ })).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });

  it('shows an error when the iteration is missing', async () => {
    render(TrackerView, { props: { iterationId: 'ghost', onBack: vi.fn() } });
    expect(await screen.findByText('Playthrough not found.')).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    vi.spyOn(session.backend!, 'getIteration').mockRejectedValue(new Error('disk error'));
    render(TrackerView, { props: { iterationId: 'x', onBack: vi.fn() } });
    expect(await screen.findByText('disk error')).toBeInTheDocument();
  });

  it('autosaves an edit and shows the saved state', async () => {
    const id = await makeIteration();
    const spy = vi.spyOn(session.backend!, 'saveProgress');
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByRole('button', { name: /Inventory Tracker/ });
    const row = screen.getByText('Alligator Skin').closest('tr')!;
    await fireEvent.click(
      within(row).getByLabelText('Increase Alligator Skin — Satchels delivered')
    );
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(await screen.findByText('✓ Saved')).toBeInTheDocument();
  });

  it('shows a failure state when saving fails', async () => {
    const id = await makeIteration();
    vi.spyOn(session.backend!, 'saveProgress').mockRejectedValue(new Error('quota exceeded'));
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByRole('button', { name: /Inventory Tracker/ });
    const row = screen.getByText('Alligator Skin').closest('tr')!;
    await fireEvent.click(
      within(row).getByLabelText('Increase Alligator Skin — Satchels delivered')
    );
    expect(await screen.findByText('⚠ Save failed')).toBeInTheDocument();
  });

  it('renames the playthrough on blur', async () => {
    const id = await makeIteration('Old Name');
    const spy = vi.spyOn(session.backend!, 'updateTitle');
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByText('Old Name');
    await fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('Old Name');
    await fireEvent.input(input, { target: { value: 'New Name' } });
    await fireEvent.blur(input);
    expect(spy).toHaveBeenCalledWith(id, 'New Name');
    expect(await screen.findByText('New Name')).toBeInTheDocument();
  });

  it('commits a rename with the Enter key', async () => {
    const id = await makeIteration('Rename Me');
    const spy = vi.spyOn(session.backend!, 'updateTitle');
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByText('Rename Me');
    await fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('Rename Me');
    await fireEvent.input(input, { target: { value: 'Renamed' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(spy).toHaveBeenCalledWith(id, 'Renamed');
  });

  it('does not call the backend when the title is unchanged', async () => {
    const id = await makeIteration('Same');
    const spy = vi.spyOn(session.backend!, 'updateTitle');
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByText('Same');
    await fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('Same');
    await fireEvent.blur(input);
    expect(spy).not.toHaveBeenCalled();
  });

  it('persists a freeze change', async () => {
    const id = await makeIteration();
    const spy = vi.spyOn(session.backend!, 'saveProgress');
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByRole('button', { name: /Inventory Tracker/ });
    await fireEvent.click(screen.getByLabelText('Freeze column Satchels'));
    await waitFor(
      () =>
        expect(spy).toHaveBeenCalledWith(
          id,
          expect.objectContaining({
            freeze: expect.objectContaining({
              cols: expect.objectContaining({ inventory: ['satchels'] })
            })
          })
        ),
      { timeout: 8000 }
    );
  });

  it('shows an error if renaming fails', async () => {
    const id = await makeIteration('Before');
    vi.spyOn(session.backend!, 'updateTitle').mockRejectedValue(new Error('rename blew up'));
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByText('Before');
    await fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('Before');
    await fireEvent.input(input, { target: { value: 'After' } });
    await fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('rename blew up');
  });

  it('switches between sheet tabs', async () => {
    const id = await makeIteration();
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByRole('button', { name: /Inventory Tracker/ });
    await fireEvent.click(screen.getByRole('button', { name: /Camp Improvements/ }));
    // The Camp Improvements sheet has a "Location" column header.
    expect(await screen.findByRole('columnheader', { name: /Location/ })).toBeInTheDocument();
  });

  it('marks a fully-delivered sheet tab as done', async () => {
    const id = await makeIteration();
    await session.backend!.saveProgress(id, {
      delivered: fullDelivered('saddles'),
      freeze: { cols: {}, rows: {} },
      history: []
    });
    render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    const tab = await screen.findByRole('button', { name: /Trapper - Saddles/ });
    expect(tab.className).toContain('done');
    expect(within(tab).getByText('100%')).toBeInTheDocument();
  });

  it('calls onBack when the back button is used', async () => {
    const id = await makeIteration();
    const onBack = vi.fn();
    render(TrackerView, { props: { iterationId: id, onBack } });
    await screen.findByRole('button', { name: /Inventory Tracker/ });
    await fireEvent.click(screen.getByTitle('Back to playthroughs'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('flushes a pending save when unmounted', async () => {
    const id = await makeIteration();
    const spy = vi.spyOn(session.backend!, 'saveProgress');
    const { unmount } = render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
    await screen.findByRole('button', { name: /Inventory Tracker/ });
    const row = screen.getByText('Alligator Skin').closest('tr')!;
    await fireEvent.click(
      within(row).getByLabelText('Increase Alligator Skin — Satchels delivered')
    );
    unmount(); // pending debounce timer should flush immediately
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });

  describe('Excel import', () => {
    it('merges uploaded progress into the board and records an undoable checkpoint', async () => {
      const id = await makeIteration();
      const spy = vi.spyOn(session.backend!, 'saveProgress');
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByRole('button', { name: /Inventory Tracker/ });

      const file = inventoryXlsx([['Alligator Skin', 'Swamps', 1, 0, 1, 0, 1]]);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await fireEvent.change(input, { target: { files: [file] } });

      // Alligator's Camp (required 1) is now collected via the import.
      const row = screen.getByText('Alligator Skin').closest('tr')!;
      await waitFor(() => {
        const camp = within(row).getByRole('spinbutton', {
          name: /Alligator Skin — Camp delivered/
        }) as HTMLInputElement;
        expect(camp.value).toBe('1');
      });

      // A checkpoint was recorded so the import can be rolled back.
      expect(await screen.findByRole('button', { name: /History \(1\)/ })).toBeInTheDocument();
      await waitFor(() => expect(spy).toHaveBeenCalled());
    });

    it('keeps the higher value when importing over existing progress (non-destructive)', async () => {
      const id = await makeIteration();
      // Pre-seed a higher Camp value than the import will supply.
      await session.backend!.saveProgress(id, {
        delivered: { inventory: { 'inventory-6': { camp: 5 } } },
        freeze: { cols: {}, rows: {} },
        history: []
      });
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByRole('button', { name: /Inventory Tracker/ });

      const file = inventoryXlsx([['Alligator Skin', 'Swamps', 1, 0, 1, 0, 1]]);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await fireEvent.change(input, { target: { files: [file] } });

      const row = screen.getByText('Alligator Skin').closest('tr')!;
      // Existing 5 wins over the imported 1 — no progress lost.
      await screen.findByRole('button', { name: /History \(1\)/ });
      const camp = within(row).getByRole('spinbutton', {
        name: /Alligator Skin — Camp delivered/
      }) as HTMLInputElement;
      expect(camp.value).toBe('5');
    });
  });

  describe('mobile card view', () => {
    const realMatchMedia = window.matchMedia;
    afterEach(() => {
      window.matchMedia = realMatchMedia; // restore the desktop default
    });

    // A controllable matchMedia: starts matched (mobile) and lets a test flip
    // the viewport and fire the change listener the component subscribes to.
    let matches = true;
    let listener: (() => void) | null = null;
    function useMobile() {
      matches = true;
      listener = null;
      window.matchMedia = ((query: string) => ({
        get matches() {
          return matches;
        },
        media: query,
        onchange: null,
        addEventListener: (_e: string, cb: () => void) => (listener = cb),
        removeEventListener: () => (listener = null),
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false
      })) as unknown as typeof window.matchMedia;
    }
    function resizeTo(isNarrow: boolean) {
      matches = isNarrow;
      listener?.();
    }

    /** Expand a card by its (unique) material name text. */
    async function openCard(name: string) {
      const head = screen.getByText(name).closest('button');
      await fireEvent.click(head!);
    }

    it('renders the searchable card list instead of the grid', async () => {
      useMobile();
      const id = await makeIteration();
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      // Sheet switcher + search present; no grid tab strip.
      expect(await screen.findByLabelText('Search Inventory Tracker')).toBeInTheDocument();
      expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
      // A material appears as a card.
      expect(screen.getByText('Alligator Skin')).toBeInTheDocument();
    });

    it('autosaves a delivery made from a card stepper', async () => {
      useMobile();
      const id = await makeIteration();
      const spy = vi.spyOn(session.backend!, 'saveProgress');
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByLabelText('Search Inventory Tracker');
      // Expand the Alligator Skin card, then bump a stepper.
      await openCard('Alligator Skin');
      await fireEvent.click(screen.getByLabelText('Increase Alligator Skin — Camp delivered'));
      expect(screen.getByText('Saving…')).toBeInTheDocument();
      await waitFor(() => expect(spy).toHaveBeenCalled());
    });

    it('switches sheets through the bottom-sheet picker', async () => {
      useMobile();
      const id = await makeIteration();
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByLabelText('Search Inventory Tracker');
      // Open the picker and choose Camp Improvements.
      await fireEvent.click(screen.getByText('Inventory Tracker').closest('button')!);
      const dialog = await screen.findByRole('dialog', { name: 'Jump to a sheet' });
      await fireEvent.click(within(dialog).getByRole('button', { name: /Camp Improvements/ }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Jump to a sheet' })).not.toBeInTheDocument()
      );
      expect(screen.getByLabelText('Search Camp Improvements')).toBeInTheDocument();
    });

    it('marks a whole card collected via the row check flow', async () => {
      useMobile();
      const id = await makeIteration();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByLabelText('Search Inventory Tracker');
      await openCard('Alligator Skin');
      await fireEvent.click(screen.getByRole('button', { name: 'Mark all collected' }));
      // The row-check records an undoable checkpoint (shared with the grid flow).
      expect(await screen.findByRole('button', { name: /History \(1\)/ })).toBeInTheDocument();
    });

    it('opens the history panel from a card reset', async () => {
      useMobile();
      const id = await makeIteration();
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByLabelText('Search Inventory Tracker');
      await openCard('Alligator Skin');
      await fireEvent.click(screen.getByRole('button', { name: 'Reset…' }));
      expect(await screen.findByRole('dialog', { name: 'Change history' })).toBeInTheDocument();
    });

    it('dismisses the sheet picker via the backdrop', async () => {
      useMobile();
      const id = await makeIteration();
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByLabelText('Search Inventory Tracker');
      await fireEvent.click(screen.getByText('Inventory Tracker').closest('button')!);
      await screen.findByRole('dialog', { name: 'Jump to a sheet' });
      await fireEvent.click(screen.getByLabelText('Close sheet switcher'));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Jump to a sheet' })).not.toBeInTheDocument()
      );
    });

    it('swaps to the grid when the viewport widens past the breakpoint', async () => {
      useMobile();
      const id = await makeIteration();
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByLabelText('Search Inventory Tracker');
      // Widen: the media listener fires and the grid replaces the card list.
      resizeTo(false);
      // The grid tab strip (with a Camp Improvements tab that never exists in the
      // card view) appears; the card search box is gone. The grid remounts ~800
      // cells, so allow a generous poll window.
      expect(
        await screen.findByRole('button', { name: /Camp Improvements/ }, { timeout: 8000 })
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Search Inventory Tracker')).not.toBeInTheDocument();
    });
  });

  describe('bulk check + history', () => {
    it('checks a whole row after confirmation and records history', async () => {
      const id = await makeIteration();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const spy = vi.spyOn(session.backend!, 'saveProgress');
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByRole('button', { name: /Inventory Tracker/ });

      const row = screen.getByText('Alligator Skin').closest('tr')!;
      await fireEvent.click(
        within(row).getByLabelText('Check all collected in row Alligator Skin')
      );

      // A checkpoint was recorded (History button shows a count).
      expect(await screen.findByRole('button', { name: /History \(1\)/ })).toBeInTheDocument();
      // Camp required for Alligator Skin is 1 → now collected.
      const input = within(row).getByRole('spinbutton', {
        name: /Alligator Skin — Camp delivered/
      }) as HTMLInputElement;
      expect(input.value).toBe('1');
      await waitFor(() => expect(spy).toHaveBeenCalled());
    });

    it('does not check when the confirmation is cancelled', async () => {
      const id = await makeIteration();
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByRole('button', { name: /Inventory Tracker/ });

      const row = screen.getByText('Alligator Skin').closest('tr')!;
      await fireEvent.click(
        within(row).getByLabelText('Check all collected in row Alligator Skin')
      );

      const input = within(row).getByRole('spinbutton', {
        name: /Alligator Skin — Camp delivered/
      }) as HTMLInputElement;
      expect(input.value).toBe('0');
      // No history recorded.
      expect(screen.getByRole('button', { name: /^🕘 History$/ })).toBeInTheDocument();
    });

    it('opens an empty history panel', async () => {
      const id = await makeIteration();
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByRole('button', { name: /Inventory Tracker/ });
      await fireEvent.click(screen.getByRole('button', { name: /History/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Change history' });
      expect(within(dialog).getByText(/No history yet/)).toBeInTheDocument();
    });

    it('restores a checkpoint from history, reverting a checked row', async () => {
      const id = await makeIteration();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByRole('button', { name: /Inventory Tracker/ });

      const row = screen.getByText('Alligator Skin').closest('tr')!;
      await fireEvent.click(
        within(row).getByLabelText('Check all collected in row Alligator Skin')
      );
      const campInput = within(row).getByRole('spinbutton', {
        name: /Alligator Skin — Camp delivered/
      }) as HTMLInputElement;
      expect(campInput.value).toBe('1');

      // Open history and restore the pre-check checkpoint.
      await fireEvent.click(screen.getByRole('button', { name: /History \(1\)/ }));
      const dialog = await screen.findByRole('dialog', { name: 'Change history' });
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));

      // The row is reverted, and the restore is itself recorded (count → 2).
      await waitFor(() => {
        const reverted = within(row).getByRole('spinbutton', {
          name: /Alligator Skin — Camp delivered/
        }) as HTMLInputElement;
        expect(reverted.value).toBe('0');
      });
      expect(screen.getByRole('button', { name: /History \(2\)/ })).toBeInTheDocument();
    });

    it('offers a scoped reset from a column and can be dismissed', async () => {
      const id = await makeIteration();
      render(TrackerView, { props: { iterationId: id, onBack: vi.fn() } });
      await screen.findByRole('button', { name: /Inventory Tracker/ });
      await fireEvent.click(screen.getByLabelText('Reset column Camp from history'));
      const dialog = await screen.findByRole('dialog', { name: 'Change history' });
      expect(within(dialog).getByText(/Reset column “Camp”/)).toBeInTheDocument();
      await fireEvent.click(within(dialog).getByLabelText('Close history'));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Change history' })).not.toBeInTheDocument()
      );
    });
  });
});
