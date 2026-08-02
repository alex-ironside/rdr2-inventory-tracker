import { describe, it, expect } from 'vitest';
import { buildDisplayColumns, rowHeaderKey, statusInfo, COMPUTED_COLUMNS } from '../src/lib/grid';
import type { RowTotals } from '../src/lib/compute';
import type { Sheet } from '../src/lib/types';

const base: Sheet = {
  id: 's',
  title: 'S',
  note: '',
  columns: [
    { key: 'name', label: 'Name', type: 'label' },
    { key: 'q', label: 'Qty', type: 'tracked' }
  ],
  rows: []
};

describe('buildDisplayColumns', () => {
  it('returns base columns for a non-computed sheet', () => {
    expect(buildDisplayColumns(base).map((c) => c.key)).toEqual(['name', 'q']);
  });

  it('appends computed columns for a computed sheet', () => {
    const computed: Sheet = { ...base, computed: true };
    const keys = buildDisplayColumns(computed).map((c) => c.key);
    expect(keys).toEqual(['name', 'q', ...COMPUTED_COLUMNS.map((c) => c.key)]);
  });

  it('does not mutate the source columns', () => {
    const cols = buildDisplayColumns(base);
    cols[0].label = 'changed';
    expect(base.columns[0].label).toBe('Name');
  });
});

describe('rowHeaderKey', () => {
  it('returns the first label column key', () => {
    expect(rowHeaderKey(base)).toBe('name');
  });

  it('returns null when there is no label column', () => {
    const noLabel: Sheet = { ...base, columns: [{ key: 'q', label: 'Q', type: 'tracked' }] };
    expect(rowHeaderKey(noLabel)).toBeNull();
  });
});

function totals(partial: Partial<RowTotals>): RowTotals {
  return { have: 0, needed: 0, remaining: 0, complete: false, started: false, ...partial };
}

describe('statusInfo', () => {
  it('reports none when nothing is required', () => {
    expect(statusInfo(totals({ needed: 0 }))).toEqual({ kind: 'none', text: '—' });
  });

  it('reports complete', () => {
    expect(statusInfo(totals({ needed: 3, have: 3, complete: true, started: true }))).toEqual({
      kind: 'complete',
      text: 'Complete'
    });
  });

  it('reports partial progress with remaining count', () => {
    expect(statusInfo(totals({ needed: 5, have: 2, remaining: 3, started: true }))).toEqual({
      kind: 'partial',
      text: '3 to go'
    });
  });

  it('reports todo when not started', () => {
    expect(statusInfo(totals({ needed: 5, remaining: 5 }))).toEqual({
      kind: 'todo',
      text: 'Need more'
    });
  });
});
