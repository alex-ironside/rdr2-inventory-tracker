import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import SheetCards from '../../src/components/SheetCards.svelte';
import type { Sheet } from '../../src/lib/types';

const sheet: Sheet = {
  id: 'inv',
  title: 'Inventory Tracker',
  note: '',
  columns: [
    { key: 'material', label: 'Material', type: 'label' },
    { key: 'biome', label: 'Biome', type: 'meta' },
    { key: 'satchels', label: 'Satchels', type: 'tracked' },
    { key: 'camp', label: 'Camp', type: 'tracked' }
  ],
  rows: [
    { id: 'sec', section: true, label: 'PELTS' },
    {
      id: 'beaver',
      cells: {
        material: { value: 'Beaver Pelt' },
        biome: { value: 'Grizzlies' },
        satchels: { required: 2 }
      }
    },
    {
      id: 'deer',
      cells: { material: { value: 'Deer Pelt' }, biome: { value: 'West' }, camp: { required: 1 } }
    }
  ]
};

function setup(delivered = {}) {
  const onDeliver = vi.fn();
  const onCheck = vi.fn();
  const onReset = vi.fn();
  render(SheetCards, { props: { sheet, delivered, onDeliver, onCheck, onReset } });
  return { onDeliver, onCheck, onReset };
}

describe('SheetCards', () => {
  it('renders a section header and a card per trackable row', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'PELTS' })).toBeInTheDocument();
    expect(screen.getByText('Beaver Pelt')).toBeInTheDocument();
    expect(screen.getByText('Deer Pelt')).toBeInTheDocument();
  });

  it('shows a count on each filter chip', () => {
    setup();
    const group = screen.getByRole('group', { name: 'Filter by status' });
    // Two cards, both to-collect.
    expect(within(group).getByRole('button', { name: /All 2/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /To collect 2/ })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: /Done 0/ })).toBeInTheDocument();
  });

  it('filters by search query', async () => {
    setup();
    await fireEvent.input(screen.getByLabelText('Search Inventory Tracker'), {
      target: { value: 'deer' }
    });
    expect(screen.queryByText('Beaver Pelt')).not.toBeInTheDocument();
    expect(screen.getByText('Deer Pelt')).toBeInTheDocument();
  });

  it('clears the search with the clear button', async () => {
    setup();
    const input = screen.getByLabelText('Search Inventory Tracker');
    await fireEvent.input(input, { target: { value: 'deer' } });
    await fireEvent.click(screen.getByLabelText('Clear search'));
    expect(screen.getByText('Beaver Pelt')).toBeInTheDocument();
  });

  it('filters by status chip', async () => {
    setup({ inv: { beaver: { satchels: 2 } } }); // beaver complete, deer todo
    await fireEvent.click(screen.getByRole('button', { name: /Done 1/ }));
    expect(screen.getByText('Beaver Pelt')).toBeInTheDocument();
    expect(screen.queryByText('Deer Pelt')).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    setup();
    await fireEvent.input(screen.getByLabelText('Search Inventory Tracker'), {
      target: { value: 'zzz' }
    });
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('expands a card and forwards a delivery with its row id', async () => {
    const { onDeliver } = setup();
    await fireEvent.click(screen.getByRole('button', { name: /Beaver Pelt/ }));
    await fireEvent.click(screen.getByLabelText('Increase Beaver Pelt — Satchels delivered'));
    expect(onDeliver).toHaveBeenCalledWith('beaver', 'satchels', 1);
  });

  it('forwards mark-all and reset with the row id', async () => {
    const { onCheck, onReset } = setup();
    await fireEvent.click(screen.getByRole('button', { name: /Deer Pelt/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Mark all collected' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Reset…' }));
    expect(onCheck).toHaveBeenCalledWith('deer');
    expect(onReset).toHaveBeenCalledWith('deer');
  });
});
