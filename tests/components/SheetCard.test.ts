import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import SheetCard from '../../src/components/SheetCard.svelte';
import { buildCards } from '../../src/lib/cardlist';
import type { Sheet } from '../../src/lib/types';

const inv: Sheet = {
  id: 'inv',
  title: 'Inventory',
  note: '',
  columns: [
    { key: 'material', label: 'Material', type: 'label' },
    { key: 'biome', label: 'Biome', type: 'meta' },
    { key: 'satchels', label: 'Satchels', type: 'tracked' },
    { key: 'camp', label: 'Camp', type: 'tracked' }
  ],
  rows: [
    {
      id: 'r1',
      cells: {
        material: { value: 'Beaver Pelt' },
        biome: { value: 'Grizzlies' },
        satchels: { required: 2 },
        camp: { required: 1 }
      }
    }
  ]
};

const reinforced: Sheet = {
  id: 'rei',
  title: 'Reinforced',
  note: '',
  columns: [
    { key: 'set', label: 'Set', type: 'label' },
    { key: 'done', label: 'Done?', type: 'bool' }
  ],
  rows: [{ id: 'x1', cells: { set: { value: 'Gun Belt' }, done: { required: 1 } } }]
};

function invCard(delivered = {}) {
  return buildCards(inv, delivered)[0];
}

describe('SheetCard', () => {
  it('shows name, subtitle, aggregate count and status when collapsed', () => {
    render(SheetCard, {
      props: {
        item: invCard(),
        open: false,
        onToggle: vi.fn(),
        onDeliver: vi.fn(),
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    expect(screen.getByText('Beaver Pelt')).toBeInTheDocument();
    expect(screen.getByText('Grizzlies')).toBeInTheDocument();
    expect(screen.getByText('Need more')).toBeInTheDocument(); // status text, not colour alone
    expect(screen.getByRole('button', { name: /Beaver Pelt/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    // Steppers are hidden until expanded.
    expect(screen.queryByLabelText(/Satchels delivered/)).not.toBeInTheDocument();
  });

  it('toggles open, revealing a stepper per tracked part', async () => {
    const onToggle = vi.fn();
    render(SheetCard, {
      props: {
        item: invCard(),
        open: true,
        onToggle,
        onDeliver: vi.fn(),
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    expect(screen.getByLabelText('Increase Beaver Pelt — Satchels delivered')).toBeInTheDocument();
    expect(screen.getByLabelText('Increase Beaver Pelt — Camp delivered')).toBeInTheDocument();
    // Click the card head (located via its name text to avoid matching steppers).
    await fireEvent.click(screen.getByText('Beaver Pelt').closest('button')!);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('emits the new delivered value when a stepper is used', async () => {
    const onDeliver = vi.fn();
    render(SheetCard, {
      props: {
        item: invCard(),
        open: true,
        onToggle: vi.fn(),
        onDeliver,
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    await fireEvent.click(screen.getByLabelText('Increase Beaver Pelt — Satchels delivered'));
    expect(onDeliver).toHaveBeenCalledWith('satchels', 1);
  });

  it('fires the mark-all and reset actions', async () => {
    const onCheck = vi.fn();
    const onReset = vi.fn();
    render(SheetCard, {
      props: {
        item: invCard(),
        open: true,
        onToggle: vi.fn(),
        onDeliver: vi.fn(),
        onCheck,
        onReset
      }
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Mark all collected' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Reset…' }));
    expect(onCheck).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('shows a complete status and full meter when everything is delivered', () => {
    render(SheetCard, {
      props: {
        item: invCard({ inv: { r1: { satchels: 2, camp: 1 } } }),
        open: false,
        onToggle: vi.fn(),
        onDeliver: vi.fn(),
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('renders a boolean part as a checkbox and emits 1/0', async () => {
    const onDeliver = vi.fn();
    render(SheetCard, {
      props: {
        item: buildCards(reinforced, {})[0],
        open: true,
        onToggle: vi.fn(),
        onDeliver,
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    const box = screen.getByLabelText('Gun Belt Done?') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText('Not done')).toBeInTheDocument();
    await fireEvent.click(box);
    expect(onDeliver).toHaveBeenCalledWith('done', 1);
  });

  it('reflects a checked boolean part', () => {
    render(SheetCard, {
      props: {
        item: buildCards(reinforced, { rei: { x1: { done: 1 } } })[0],
        open: true,
        onToggle: vi.fn(),
        onDeliver: vi.fn(),
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    expect((screen.getByLabelText('Gun Belt Done?') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('omits the subtitle when a card has none', () => {
    const noSub = { ...invCard(), sub: '' };
    render(SheetCard, {
      props: {
        item: noSub,
        open: false,
        onToggle: vi.fn(),
        onDeliver: vi.fn(),
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    expect(screen.queryByText('Grizzlies')).not.toBeInTheDocument();
  });
});
