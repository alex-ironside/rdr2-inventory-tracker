import { describe, it, expect } from 'vitest';
import { getDelivered, setDelivered, rowTotals, sheetProgress } from '../src/lib/compute';
import type { DeliveredMap, Sheet } from '../src/lib/types';

const sheet: Sheet = {
  id: 'demo',
  title: 'Demo',
  note: '',
  computed: true,
  columns: [
    { key: 'name', label: 'Name', type: 'label' },
    { key: 'a', label: 'A', type: 'tracked' },
    { key: 'b', label: 'B', type: 'tracked' },
    { key: 'note', label: 'Note', type: 'meta' }
  ],
  rows: [
    { id: 'sec', section: true, label: 'SECTION' },
    {
      id: 'r1',
      cells: {
        name: { value: 'Item 1' },
        a: { required: 2 },
        b: { required: 3 },
        note: { value: 'hi' }
      }
    },
    {
      id: 'r2',
      cells: { name: { value: 'Item 2' }, a: { required: 0 }, b: { required: 0 } }
    },
    { id: 'r3', cells: { name: { value: 'Item 3' } } } // no tracked cells
  ]
};

describe('getDelivered', () => {
  it('returns 0 when nothing is recorded', () => {
    expect(getDelivered({}, 'demo', 'r1', 'a')).toBe(0);
  });

  it('returns the stored value when present', () => {
    const map: DeliveredMap = { demo: { r1: { a: 5 } } };
    expect(getDelivered(map, 'demo', 'r1', 'a')).toBe(5);
  });
});

describe('setDelivered', () => {
  it('stores a positive value immutably', () => {
    const before: DeliveredMap = {};
    const after = setDelivered(before, 'demo', 'r1', 'a', 4);
    expect(getDelivered(after, 'demo', 'r1', 'a')).toBe(4);
    expect(before).toEqual({}); // original untouched
  });

  it('clamps negatives to zero and floors decimals', () => {
    const neg = setDelivered({}, 'demo', 'r1', 'a', -3);
    expect(neg).toEqual({});
    const frac = setDelivered({}, 'demo', 'r1', 'a', 2.9);
    expect(getDelivered(frac, 'demo', 'r1', 'a')).toBe(2);
  });

  it('treats NaN / falsy as zero', () => {
    expect(setDelivered({}, 'demo', 'r1', 'a', NaN)).toEqual({});
  });

  it('removes the cell (and prunes empty parents) when set to zero', () => {
    let map = setDelivered({}, 'demo', 'r1', 'a', 4);
    map = setDelivered(map, 'demo', 'r1', 'a', 0);
    expect(map).toEqual({});
  });

  it('keeps sibling cells when one is pruned', () => {
    let map = setDelivered({}, 'demo', 'r1', 'a', 4);
    map = setDelivered(map, 'demo', 'r1', 'b', 1);
    map = setDelivered(map, 'demo', 'r1', 'a', 0);
    expect(map).toEqual({ demo: { r1: { b: 1 } } });
  });

  it('keeps sibling rows when one row is pruned', () => {
    let map = setDelivered({}, 'demo', 'r1', 'a', 1);
    map = setDelivered(map, 'demo', 'r2', 'a', 1);
    map = setDelivered(map, 'demo', 'r1', 'a', 0);
    expect(map).toEqual({ demo: { r2: { a: 1 } } });
  });
});

describe('rowTotals', () => {
  it('sums delivered and required across tracked columns', () => {
    const map: DeliveredMap = { demo: { r1: { a: 1, b: 3 } } };
    const t = rowTotals(sheet, sheet.rows[1], map);
    expect(t).toEqual({ have: 4, needed: 5, remaining: 1, complete: false, started: true });
  });

  it('marks complete when delivered meets required', () => {
    const map: DeliveredMap = { demo: { r1: { a: 2, b: 3 } } };
    const t = rowTotals(sheet, sheet.rows[1], map);
    expect(t.complete).toBe(true);
    expect(t.remaining).toBe(0);
  });

  it('never reports negative remaining when over-delivered', () => {
    const map: DeliveredMap = { demo: { r1: { a: 10, b: 10 } } };
    expect(rowTotals(sheet, sheet.rows[1], map).remaining).toBe(0);
  });

  it('is not complete when nothing is required', () => {
    const t = rowTotals(sheet, sheet.rows[2], {});
    expect(t.needed).toBe(0);
    expect(t.complete).toBe(false);
    expect(t.started).toBe(false);
  });

  it('handles rows with no cells', () => {
    expect(rowTotals(sheet, sheet.rows[3], {}).needed).toBe(0);
  });
});

describe('sheetProgress', () => {
  it('aggregates across countable rows and ignores sections', () => {
    const map: DeliveredMap = { demo: { r1: { a: 2, b: 3 } } };
    const p = sheetProgress(sheet, map);
    expect(p.rowsTotal).toBe(1); // only r1 has needed > 0
    expect(p.rowsComplete).toBe(1);
    expect(p.have).toBe(5);
    expect(p.needed).toBe(5);
    expect(p.percent).toBe(100);
  });

  it('reports 0% for an untouched sheet and caps at 100%', () => {
    expect(sheetProgress(sheet, {}).percent).toBe(0);
    const over: DeliveredMap = { demo: { r1: { a: 99, b: 99 } } };
    expect(sheetProgress(sheet, over).percent).toBe(100);
  });

  it('reports 0% when the sheet requires nothing at all', () => {
    const nothingNeeded: Sheet = {
      id: 'empty',
      title: 'Empty',
      note: '',
      columns: [
        { key: 'name', label: 'Name', type: 'label' },
        { key: 'a', label: 'A', type: 'tracked' }
      ],
      rows: [{ id: 'r1', cells: { name: { value: 'x' }, a: { required: 0 } } }]
    };
    const p = sheetProgress(nothingNeeded, {});
    expect(p.needed).toBe(0);
    expect(p.rowsTotal).toBe(0);
    expect(p.percent).toBe(0);
  });
});
