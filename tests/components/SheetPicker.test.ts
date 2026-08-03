import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import SheetPicker from '../../src/components/SheetPicker.svelte';
import type { Sheet } from '../../src/lib/types';
import type { SheetProgress } from '../../src/lib/compute';

const sheets: Sheet[] = [
  { id: 'a', title: 'Inventory Tracker', note: '', columns: [], rows: [] },
  { id: 'b', title: 'Satchels', note: '', columns: [], rows: [] }
];

const progress: Record<string, SheetProgress> = {
  a: { have: 3, needed: 10, rowsComplete: 1, rowsTotal: 4, percent: 30 },
  b: { have: 6, needed: 6, rowsComplete: 3, rowsTotal: 3, percent: 100 }
};

function setup(overrides: Partial<Parameters<typeof render>[1]> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(SheetPicker, {
    props: {
      sheets,
      activeId: 'a',
      progressFor: (id: string) => progress[id],
      onSelect,
      onClose,
      ...(overrides as object)
    }
  });
  return { onSelect, onClose };
}

describe('SheetPicker', () => {
  it('lists every sheet with its progress and marks the active one', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Jump to a sheet' });
    const active = within(dialog).getByRole('button', { name: /Inventory Tracker/ });
    expect(active).toHaveAttribute('aria-current', 'true');
    expect(within(active).getByText('1/4 done · 30% collected')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /Satchels/ })
    ).toHaveAttribute('aria-current', 'false');
  });

  it('selects a sheet when tapped', async () => {
    const { onSelect } = setup();
    await fireEvent.click(screen.getByRole('button', { name: /Satchels/ }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('closes when the backdrop is tapped', async () => {
    const { onClose } = setup();
    await fireEvent.click(screen.getByLabelText('Close sheet switcher'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape', async () => {
    const { onClose } = setup();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ignores other keys', async () => {
    const { onClose } = setup();
    await fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
