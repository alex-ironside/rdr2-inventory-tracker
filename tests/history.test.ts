import { describe, it, expect } from 'vitest';
import {
  cellsForScope,
  checkScope,
  restoreScope,
  scopeLabel,
  pushHistory,
  MAX_HISTORY
} from '../src/lib/history';
import { getDelivered } from '../src/lib/compute';
import type { DeliveredMap, HistoryEntry, Sheet } from '../src/lib/types';

const sheet: Sheet = {
  id: 's',
  title: 'Sheet',
  note: '',
  columns: [
    { key: 'name', label: 'Material', type: 'label' },
    { key: 'a', label: 'Satchels', type: 'tracked' },
    { key: 'b', label: 'Camp', type: 'tracked' },
    { key: 'done', label: 'Done?', type: 'bool' }
  ],
  rows: [
    { id: 'sec', section: true, label: 'GROUP' },
    { id: 'r1', cells: { name: { value: 'Alpha' }, a: { required: 2 }, b: { required: 3 } } },
    { id: 'r2', cells: { name: { value: 'Beta' }, a: { required: 1 }, done: { required: 1 } } },
    { id: 'r3', cells: { name: { value: 'Gamma' }, b: { required: 4 } } }
  ]
};

describe('cellsForScope', () => {
  it('lists tracked cells in a row (ignoring untracked/absent)', () => {
    const cells = cellsForScope(sheet, { kind: 'row', rowId: 'r1' });
    expect(cells).toEqual([
      { rowId: 'r1', colKey: 'a', required: 2 },
      { rowId: 'r1', colKey: 'b', required: 3 }
    ]);
  });

  it('lists tracked cells in a column across data rows only', () => {
    const cells = cellsForScope(sheet, { kind: 'column', colKey: 'b' });
    expect(cells).toEqual([
      { rowId: 'r1', colKey: 'b', required: 3 },
      { rowId: 'r3', colKey: 'b', required: 4 }
    ]);
  });

  it('lists a single tracked cell', () => {
    expect(cellsForScope(sheet, { kind: 'cell', rowId: 'r2', colKey: 'done' })).toEqual([
      { rowId: 'r2', colKey: 'done', required: 1 }
    ]);
  });

  it('returns nothing for a cell that is not tracked', () => {
    expect(cellsForScope(sheet, { kind: 'cell', rowId: 'r1', colKey: 'name' })).toEqual([]);
    expect(cellsForScope(sheet, { kind: 'cell', rowId: 'r3', colKey: 'a' })).toEqual([]);
  });

  it('returns nothing for a non-existent row', () => {
    expect(cellsForScope(sheet, { kind: 'row', rowId: 'ghost' })).toEqual([]);
    expect(cellsForScope(sheet, { kind: 'cell', rowId: 'ghost', colKey: 'a' })).toEqual([]);
  });

  it('returns nothing for a section row', () => {
    expect(cellsForScope(sheet, { kind: 'cell', rowId: 'sec', colKey: 'a' })).toEqual([]);
  });

  it('returns nothing for a non-existent column in a cell scope', () => {
    expect(cellsForScope(sheet, { kind: 'cell', rowId: 'r1', colKey: 'zzz' })).toEqual([]);
  });
});

describe('checkScope', () => {
  it('sets delivered to required for every cell in a row', () => {
    const next = checkScope({}, sheet, { kind: 'row', rowId: 'r1' });
    expect(next).toEqual({ s: { r1: { a: 2, b: 3 } } });
  });

  it('sets delivered to required for every cell in a column', () => {
    const next = checkScope({}, sheet, { kind: 'column', colKey: 'a' });
    expect(next).toEqual({ s: { r1: { a: 2 }, r2: { a: 1 } } });
  });

  it('overwrites existing lower/higher values with required', () => {
    const start: DeliveredMap = { s: { r1: { a: 1 }, r2: { a: 5 } } };
    const next = checkScope(start, sheet, { kind: 'column', colKey: 'a' });
    expect(getDelivered(next, 's', 'r1', 'a')).toBe(2);
    expect(getDelivered(next, 's', 'r2', 'a')).toBe(1);
  });

  it('does not mutate the input map', () => {
    const start: DeliveredMap = {};
    checkScope(start, sheet, { kind: 'row', rowId: 'r1' });
    expect(start).toEqual({});
  });
});

describe('restoreScope', () => {
  it('restores a row from a snapshot, replacing current values', () => {
    const current: DeliveredMap = { s: { r1: { a: 2, b: 3 } } };
    const snapshot: DeliveredMap = { s: { r1: { a: 1 } } }; // b was 0 then
    const next = restoreScope(current, snapshot, sheet, { kind: 'row', rowId: 'r1' });
    expect(next).toEqual({ s: { r1: { a: 1 } } }); // b reset to 0 (pruned)
  });

  it('restores a single cell only, leaving siblings untouched', () => {
    const current: DeliveredMap = { s: { r1: { a: 2, b: 3 } } };
    const snapshot: DeliveredMap = {}; // everything was 0
    const next = restoreScope(current, snapshot, sheet, { kind: 'cell', rowId: 'r1', colKey: 'a' });
    expect(next).toEqual({ s: { r1: { b: 3 } } });
  });
});

describe('scopeLabel', () => {
  it('describes a row by its material name', () => {
    expect(scopeLabel(sheet, { kind: 'row', rowId: 'r1' })).toBe('row “Alpha”');
  });
  it('describes a column by its header label', () => {
    expect(scopeLabel(sheet, { kind: 'column', colKey: 'b' })).toBe('column “Camp”');
  });
  it('describes a cell by row and column', () => {
    expect(scopeLabel(sheet, { kind: 'cell', rowId: 'r2', colKey: 'a' })).toBe('“Beta” · Satchels');
  });
  it('falls back gracefully for unknown ids', () => {
    expect(scopeLabel(sheet, { kind: 'row', rowId: 'nope' })).toBe('row “nope”');
    expect(scopeLabel(sheet, { kind: 'column', colKey: 'zzz' })).toBe('column “zzz”');
  });
});

describe('pushHistory', () => {
  const entry = (id: string): HistoryEntry => ({ id, at: 1, label: id, delivered: {} });

  it('appends immutably', () => {
    const h: HistoryEntry[] = [];
    const next = pushHistory(h, entry('a'));
    expect(next).toHaveLength(1);
    expect(h).toHaveLength(0);
  });

  it('caps the history at MAX_HISTORY, dropping the oldest', () => {
    let h: HistoryEntry[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) h = pushHistory(h, entry(`e${i}`));
    expect(h).toHaveLength(MAX_HISTORY);
    expect(h[0].id).toBe('e5'); // first five dropped
    expect(h[h.length - 1].id).toBe(`e${MAX_HISTORY + 4}`);
  });
});
