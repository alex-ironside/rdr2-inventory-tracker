// Pure helpers for reading/writing delivered values and deriving totals.

import type { DeliveredMap, Sheet, SeedRow } from './types';

export function getDelivered(
  delivered: DeliveredMap,
  sheetId: string,
  rowId: string,
  colKey: string
): number {
  return delivered[sheetId]?.[rowId]?.[colKey] ?? 0;
}

/** Returns a new DeliveredMap with the given cell set (immutable update so
 *  Svelte reactivity fires). Clamped to >= 0. */
export function setDelivered(
  delivered: DeliveredMap,
  sheetId: string,
  rowId: string,
  colKey: string,
  value: number
): DeliveredMap {
  const v = Math.max(0, Math.floor(value || 0));
  const next: DeliveredMap = { ...delivered };
  const sheet = { ...(next[sheetId] ?? {}) };
  const row = { ...(sheet[rowId] ?? {}) };
  if (v === 0) delete row[colKey];
  else row[colKey] = v;
  if (Object.keys(row).length === 0) delete sheet[rowId];
  else sheet[rowId] = row;
  if (Object.keys(sheet).length === 0) delete next[sheetId];
  else next[sheetId] = sheet;
  return next;
}

export interface RowTotals {
  have: number;
  needed: number;
  remaining: number;
  complete: boolean;
  started: boolean;
}

/** Sum delivered vs required across every tracked column in a row. */
export function rowTotals(sheet: Sheet, row: SeedRow, delivered: DeliveredMap): RowTotals {
  let have = 0;
  let needed = 0;
  if (row.cells) {
    for (const col of sheet.columns) {
      if (col.type !== 'tracked' && col.type !== 'bool') continue;
      const cell = row.cells[col.key];
      if (!cell || cell.required == null) continue;
      needed += cell.required;
      have += getDelivered(delivered, sheet.id, row.id, col.key);
    }
  }
  const remaining = Math.max(0, needed - have);
  return {
    have,
    needed,
    remaining,
    complete: needed > 0 && have >= needed,
    started: have > 0
  };
}

export interface SheetProgress {
  have: number;
  needed: number;
  rowsComplete: number;
  rowsTotal: number;
  percent: number;
}

export function sheetProgress(sheet: Sheet, delivered: DeliveredMap): SheetProgress {
  let have = 0;
  let needed = 0;
  let rowsComplete = 0;
  let rowsTotal = 0;
  for (const row of sheet.rows) {
    if (row.section || !row.cells) continue;
    const t = rowTotals(sheet, row, delivered);
    if (t.needed <= 0) continue;
    rowsTotal++;
    have += t.have;
    needed += t.needed;
    if (t.complete) rowsComplete++;
  }
  const percent = needed > 0 ? Math.min(100, Math.round((have / needed) * 100)) : 0;
  return { have, needed, rowsComplete, rowsTotal, percent };
}
