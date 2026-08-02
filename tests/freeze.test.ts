import { describe, it, expect } from 'vitest';
import {
  emptyFreeze,
  frozenColKeys,
  frozenRowIds,
  isColFrozen,
  isRowFrozen,
  toggleCol,
  toggleRow,
  orderedFrozen,
  cumulativeOffsets
} from '../src/lib/freeze';

describe('emptyFreeze', () => {
  it('has empty cols and rows maps', () => {
    expect(emptyFreeze()).toEqual({ cols: {}, rows: {} });
  });
});

describe('column freezing', () => {
  it('reports no frozen columns initially', () => {
    expect(frozenColKeys(emptyFreeze(), 's1')).toEqual([]);
    expect(isColFrozen(emptyFreeze(), 's1', 'a')).toBe(false);
  });

  it('freezes a column immutably', () => {
    const start = emptyFreeze();
    const next = toggleCol(start, 's1', 'a');
    expect(isColFrozen(next, 's1', 'a')).toBe(true);
    expect(frozenColKeys(start, 's1')).toEqual([]); // original untouched
  });

  it('unfreezes on second toggle and prunes the sheet key', () => {
    let f = toggleCol(emptyFreeze(), 's1', 'a');
    f = toggleCol(f, 's1', 'a');
    expect(isColFrozen(f, 's1', 'a')).toBe(false);
    expect(f.cols.s1).toBeUndefined();
  });

  it('keeps other frozen columns when one is removed', () => {
    let f = toggleCol(emptyFreeze(), 's1', 'a');
    f = toggleCol(f, 's1', 'b');
    f = toggleCol(f, 's1', 'a');
    expect(frozenColKeys(f, 's1')).toEqual(['b']);
  });
});

describe('row freezing', () => {
  it('freezes and unfreezes a row', () => {
    let f = toggleRow(emptyFreeze(), 's1', 'r1');
    expect(isRowFrozen(f, 's1', 'r1')).toBe(true);
    expect(frozenRowIds(f, 's1')).toEqual(['r1']);
    f = toggleRow(f, 's1', 'r1');
    expect(isRowFrozen(f, 's1', 'r1')).toBe(false);
  });
});

describe('orderedFrozen', () => {
  it('returns frozen members in display order, ignoring unknowns', () => {
    expect(orderedFrozen(['c', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['a', 'c']);
  });

  it('returns empty when nothing frozen', () => {
    expect(orderedFrozen([], ['a', 'b'])).toEqual([]);
  });
});

describe('cumulativeOffsets', () => {
  it('returns prefix sums (offset before each item)', () => {
    expect(cumulativeOffsets([10, 20, 30])).toEqual([0, 10, 30]);
  });

  it('returns an empty array for no sizes', () => {
    expect(cumulativeOffsets([])).toEqual([]);
  });
});
