import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/svelte';
import SheetGrid from '../../src/components/SheetGrid.svelte';
import type { DeliveredMap, FreezeState, Sheet } from '../../src/lib/types';

const computedSheet: Sheet = {
  id: 'main',
  title: 'Main Sheet',
  note: 'Enter collected quantities.',
  computed: true,
  columns: [
    { key: 'name', label: 'Material', type: 'label' },
    { key: 'info', label: 'Biome', type: 'meta' },
    { key: 'q1', label: 'Satchels', type: 'tracked' },
    { key: 'q2', label: 'Camp', type: 'tracked' }
  ],
  rows: [
    { id: 'sec', section: true, label: 'PELTS' },
    {
      id: 'complete',
      cells: { name: { value: 'Alligator' }, info: { value: 'Swamp' }, q1: { required: 2 } }
    },
    { id: 'partial', cells: { name: { value: 'Beaver' }, q1: { required: 5 } } },
    { id: 'todo', cells: { name: { value: 'Bison' }, q1: { required: 3 } } },
    { id: 'none', cells: { name: { value: 'Trinket' } } }, // no tracked cell → empty td + status none
    { id: 'nolabel', cells: { q1: { required: 1 } } } // label cell missing → rowLabel falls back to id
  ]
};

const boolSheet: Sheet = {
  id: 'reinf',
  title: 'Reinforced',
  note: '',
  columns: [
    { key: 'set', label: 'Set', type: 'label' },
    { key: 'done', label: 'Done?', type: 'bool' }
  ],
  rows: [{ id: 'r1', cells: { set: { value: 'Bandit' }, done: { required: 1 } } }]
};

const noLabelSheet: Sheet = {
  id: 'nolbl',
  title: 'No Label',
  note: '',
  columns: [{ key: 'q', label: 'Qty', type: 'tracked' }],
  rows: [{ id: 'only', cells: { q: { required: 2 } } }]
};

function noFreeze(): FreezeState {
  return { cols: {}, rows: {} };
}

beforeEach(() => {
  // getBoundingClientRect returns zeros in jsdom; provide stable numbers so the
  // sticky-offset effect exercises its math.
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 100,
    height: 30,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    x: 0,
    y: 0,
    toJSON() {}
  })) as unknown as typeof Element.prototype.getBoundingClientRect;
});
afterEach(() => vi.restoreAllMocks());

describe('SheetGrid computed sheet', () => {
  const props = (delivered: DeliveredMap = {}, freeze = noFreeze()) => ({
    sheet: computedSheet,
    delivered,
    freeze,
    onDelivered: vi.fn(),
    onFreeze: vi.fn(),
    onCheck: vi.fn(),
    onReset: vi.fn()
  });

  it('renders the note, section header and computed columns', () => {
    render(SheetGrid, { props: props() });
    expect(screen.getByText('Enter collected quantities.')).toBeInTheDocument();
    expect(screen.getByText('PELTS')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Have/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Status/ })).toBeInTheDocument();
  });

  it('shows each status kind based on delivered vs required', () => {
    const delivered: DeliveredMap = {
      main: { complete: { q1: 2 }, partial: { q1: 2 } }
    };
    render(SheetGrid, { props: props(delivered) });
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('3 to go')).toBeInTheDocument();
    expect(screen.getAllByText('Need more').length).toBeGreaterThan(0);
    // The row with nothing required shows an em dash status.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('edits a tracked cell through the stepper', async () => {
    const p = props();
    render(SheetGrid, { props: p });
    const row = screen.getByText('Bison').closest('tr')!;
    await fireEvent.click(within(row).getByLabelText('Increase Bison — Satchels delivered'));
    expect(p.onDelivered).toHaveBeenCalledWith({ main: { todo: { q1: 1 } } });
  });

  it('freezes a column when its pin is pressed', async () => {
    const p = props();
    render(SheetGrid, { props: p });
    await fireEvent.click(screen.getByLabelText('Freeze column Satchels'));
    expect(p.onFreeze).toHaveBeenCalledWith({ cols: { main: ['q1'] }, rows: {} });
  });

  it('freezes a row when its pin is pressed', async () => {
    const p = props();
    render(SheetGrid, { props: p });
    await fireEvent.click(screen.getByLabelText('Freeze row Beaver'));
    expect(p.onFreeze).toHaveBeenCalledWith({ cols: {}, rows: { main: ['partial'] } });
  });

  it('re-measures sticky offsets on window resize', async () => {
    render(SheetGrid, { props: props({}, { cols: { main: ['name'] }, rows: {} }) });
    window.dispatchEvent(new Event('resize'));
    // The grid remains rendered after the resize-driven re-measure.
    expect(await screen.findByRole('columnheader', { name: /Material/ })).toBeInTheDocument();
  });

  it('requests a column check with the column scope', async () => {
    const p = props();
    render(SheetGrid, { props: p });
    await fireEvent.click(screen.getByLabelText('Check all collected in column Satchels'));
    expect(p.onCheck).toHaveBeenCalledWith({ kind: 'column', colKey: 'q1' });
  });

  it('requests a row check with the row scope', async () => {
    const p = props();
    render(SheetGrid, { props: p });
    const row = screen.getByText('Beaver').closest('tr')!;
    await fireEvent.click(within(row).getByLabelText('Check all collected in row Beaver'));
    expect(p.onCheck).toHaveBeenCalledWith({ kind: 'row', rowId: 'partial' });
  });

  it('requests a reset from history for a column', async () => {
    const p = props();
    render(SheetGrid, { props: p });
    await fireEvent.click(screen.getByLabelText('Reset column Satchels from history'));
    expect(p.onReset).toHaveBeenCalledWith({ kind: 'column', colKey: 'q1' });
  });

  it('does not offer check on label or computed columns', () => {
    render(SheetGrid, { props: props() });
    expect(
      screen.queryByLabelText('Check all collected in column Material')
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Check all collected in column Have')).not.toBeInTheDocument();
  });

  it('applies frozen styling when a column and row are already frozen', () => {
    render(SheetGrid, {
      props: props({}, { cols: { main: ['name'] }, rows: { main: ['partial'] } })
    });
    // Pins reflect the pressed (frozen) state.
    expect(screen.getByLabelText('Unfreeze column Material')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByLabelText('Unfreeze row Beaver')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('SheetGrid bool + no-label sheets', () => {
  it('toggles a boolean (Done?) cell', async () => {
    const onDelivered = vi.fn();
    render(SheetGrid, {
      props: {
        sheet: boolSheet,
        delivered: {},
        freeze: noFreeze(),
        onDelivered,
        onFreeze: vi.fn(),
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    await fireEvent.click(screen.getByLabelText('Bandit Done?'));
    expect(onDelivered).toHaveBeenCalledWith({ reinf: { r1: { done: 1 } } });
  });

  it('reflects a checked boolean cell', () => {
    render(SheetGrid, {
      props: {
        sheet: boolSheet,
        delivered: { reinf: { r1: { done: 1 } } },
        freeze: noFreeze(),
        onDelivered: vi.fn(),
        onFreeze: vi.fn(),
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    expect(screen.getByLabelText('Bandit Done?')).toBeChecked();
  });

  it('renders a sheet with no label column', () => {
    render(SheetGrid, {
      props: {
        sheet: noLabelSheet,
        delivered: {},
        freeze: noFreeze(),
        onDelivered: vi.fn(),
        onFreeze: vi.fn(),
        onCheck: vi.fn(),
        onReset: vi.fn()
      }
    });
    expect(screen.getByRole('columnheader', { name: /Qty/ })).toBeInTheDocument();
  });
});
