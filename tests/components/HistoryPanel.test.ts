import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import HistoryPanel from '../../src/components/HistoryPanel.svelte';
import type { HistoryEntry } from '../../src/lib/types';

const entries: HistoryEntry[] = [
  { id: 'a', at: 1000, label: 'Checked row “Alpha”', delivered: {} },
  { id: 'b', at: 2000, label: 'Checked column “Camp”', delivered: {} }
];

describe('HistoryPanel', () => {
  it('lists entries newest-first and restores the chosen one', async () => {
    const onRestore = vi.fn();
    render(HistoryPanel, {
      props: { entries, scopeLabel: null, onRestore, onClose: vi.fn() }
    });
    const rows = screen.getAllByRole('listitem');
    // Newest (b) first.
    expect(within(rows[0]).getByText('Checked column “Camp”')).toBeInTheDocument();
    await fireEvent.click(within(rows[0]).getByRole('button', { name: 'Restore' }));
    expect(onRestore).toHaveBeenCalledWith(entries[1]);
  });

  it('shows the scope in the heading when resetting a scope', () => {
    render(HistoryPanel, {
      props: { entries, scopeLabel: 'row “Alpha”', onRestore: vi.fn(), onClose: vi.fn() }
    });
    expect(screen.getByRole('heading', { name: /Reset row “Alpha”/ })).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', () => {
    render(HistoryPanel, {
      props: { entries: [], scopeLabel: null, onRestore: vi.fn(), onClose: vi.fn() }
    });
    expect(screen.getByText(/No history yet/)).toBeInTheDocument();
  });

  it('closes on the Escape key', async () => {
    const onClose = vi.fn();
    render(HistoryPanel, { props: { entries, scopeLabel: null, onRestore: vi.fn(), onClose } });
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close on other keys', async () => {
    const onClose = vi.fn();
    render(HistoryPanel, { props: { entries, scopeLabel: null, onRestore: vi.fn(), onClose } });
    await fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes via the close button', async () => {
    const onClose = vi.fn();
    render(HistoryPanel, { props: { entries, scopeLabel: null, onRestore: vi.fn(), onClose } });
    await fireEvent.click(screen.getByLabelText('Close history'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
