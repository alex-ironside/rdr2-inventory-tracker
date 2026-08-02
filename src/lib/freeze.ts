// Pure freeze-pane logic. The grid component owns DOM measurement; all set
// membership, ordering and offset math lives here so it can be unit-tested.

import type { FreezeState } from './types';

export function emptyFreeze(): FreezeState {
  return { cols: {}, rows: {} };
}

export function frozenColKeys(freeze: FreezeState, sheetId: string): string[] {
  return freeze.cols[sheetId] ?? [];
}

export function frozenRowIds(freeze: FreezeState, sheetId: string): string[] {
  return freeze.rows[sheetId] ?? [];
}

export function isColFrozen(freeze: FreezeState, sheetId: string, colKey: string): boolean {
  return frozenColKeys(freeze, sheetId).includes(colKey);
}

export function isRowFrozen(freeze: FreezeState, sheetId: string, rowId: string): boolean {
  return frozenRowIds(freeze, sheetId).includes(rowId);
}

function toggleIn(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

/** Immutably toggle a column's frozen state for a sheet. */
export function toggleCol(freeze: FreezeState, sheetId: string, colKey: string): FreezeState {
  const next = toggleIn(frozenColKeys(freeze, sheetId), colKey);
  return withList(freeze, 'cols', sheetId, next);
}

/** Immutably toggle a row's frozen state for a sheet. */
export function toggleRow(freeze: FreezeState, sheetId: string, rowId: string): FreezeState {
  const next = toggleIn(frozenRowIds(freeze, sheetId), rowId);
  return withList(freeze, 'rows', sheetId, next);
}

function withList(
  freeze: FreezeState,
  axis: 'cols' | 'rows',
  sheetId: string,
  list: string[]
): FreezeState {
  const axisMap = { ...freeze[axis] };
  if (list.length === 0) delete axisMap[sheetId];
  else axisMap[sheetId] = list;
  return { ...freeze, [axis]: axisMap };
}

/** Return the members of `order` that are in `frozenSet`, preserving the
 *  display order given by `order` (so pinned columns/rows stay in sheet order). */
export function orderedFrozen(frozenSet: string[], order: string[]): string[] {
  const set = new Set(frozenSet);
  return order.filter((k) => set.has(k));
}

/** Prefix sums: the sticky offset (px) that precedes each item given the sizes
 *  of the items before it. `[0, s0, s0+s1, ...]`. */
export function cumulativeOffsets(sizes: number[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const size of sizes) {
    offsets.push(acc);
    acc += size;
  }
  return offsets;
}
