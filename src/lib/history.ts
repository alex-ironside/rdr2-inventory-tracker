// Bulk actions + change history (pure logic).
//
// "Check" a row/column/cell = set collected (delivered) equal to required for
// every tracked cell in that scope. Each committed change records a snapshot in
// an append-only history so an accidental "check all" can be reviewed and any
// past state restored. Restoring is itself a change (and so a new snapshot).

import { getDelivered, setDelivered } from './compute';
import type { Column, DeliveredMap, HistoryEntry, Sheet } from './types';

/** Cap on retained history snapshots (keeps persisted documents small). */
export const MAX_HISTORY = 50;

export type Scope =
  | { kind: 'cell'; rowId: string; colKey: string }
  | { kind: 'row'; rowId: string }
  | { kind: 'column'; colKey: string };

export interface ScopedCell {
  rowId: string;
  colKey: string;
  required: number;
}

function isTracked(col: Column): boolean {
  return col.type === 'tracked' || col.type === 'bool';
}

function requiredAt(sheet: Sheet, rowId: string, colKey: string): number | null {
  const row = sheet.rows.find((r) => r.id === rowId);
  if (!row || row.section || !row.cells) return null;
  const col = sheet.columns.find((c) => c.key === colKey);
  if (!col || !isTracked(col)) return null;
  const req = row.cells[colKey]?.required;
  return req == null ? null : req;
}

/** Enumerate the tracked cells targeted by a scope, with their required amounts. */
export function cellsForScope(sheet: Sheet, scope: Scope): ScopedCell[] {
  const out: ScopedCell[] = [];
  if (scope.kind === 'cell') {
    const req = requiredAt(sheet, scope.rowId, scope.colKey);
    if (req != null) out.push({ rowId: scope.rowId, colKey: scope.colKey, required: req });
    return out;
  }
  if (scope.kind === 'row') {
    for (const col of sheet.columns) {
      const req = requiredAt(sheet, scope.rowId, col.key);
      if (req != null) out.push({ rowId: scope.rowId, colKey: col.key, required: req });
    }
    return out;
  }
  // column
  for (const row of sheet.rows) {
    if (row.section) continue;
    const req = requiredAt(sheet, row.id, scope.colKey);
    if (req != null) out.push({ rowId: row.id, colKey: scope.colKey, required: req });
  }
  return out;
}

/** Fold a set of (rowId,colKey,value) assignments onto a delivered map. */
function applyValues(
  delivered: DeliveredMap,
  sheetId: string,
  assignments: Array<{ rowId: string; colKey: string; value: number }>
): DeliveredMap {
  return assignments.reduce(
    (acc, { rowId, colKey, value }) => setDelivered(acc, sheetId, rowId, colKey, value),
    delivered
  );
}

/** Set collected = required for every tracked cell in the scope. */
export function checkScope(delivered: DeliveredMap, sheet: Sheet, scope: Scope): DeliveredMap {
  const assignments = cellsForScope(sheet, scope).map(({ rowId, colKey, required }) => ({
    rowId,
    colKey,
    value: required
  }));
  return applyValues(delivered, sheet.id, assignments);
}

/** Restore the scope's cells to the values held in a historical snapshot. */
export function restoreScope(
  current: DeliveredMap,
  snapshot: DeliveredMap,
  sheet: Sheet,
  scope: Scope
): DeliveredMap {
  const assignments = cellsForScope(sheet, scope).map(({ rowId, colKey }) => ({
    rowId,
    colKey,
    value: getDelivered(snapshot, sheet.id, rowId, colKey)
  }));
  return applyValues(current, sheet.id, assignments);
}

function rowName(sheet: Sheet, rowId: string): string {
  const labelCol = sheet.columns.find((c) => c.type === 'label');
  const row = sheet.rows.find((r) => r.id === rowId);
  return (labelCol && row?.cells?.[labelCol.key]?.value) || rowId;
}

function colName(sheet: Sheet, colKey: string): string {
  return sheet.columns.find((c) => c.key === colKey)?.label ?? colKey;
}

/** Human-readable description of a scope, for confirmations and history labels. */
export function scopeLabel(sheet: Sheet, scope: Scope): string {
  if (scope.kind === 'row') return `row “${rowName(sheet, scope.rowId)}”`;
  if (scope.kind === 'column') return `column “${colName(sheet, scope.colKey)}”`;
  return `“${rowName(sheet, scope.rowId)}” · ${colName(sheet, scope.colKey)}`;
}

/** Append a snapshot, capping the log length (oldest dropped first). */
export function pushHistory(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [...history, entry].slice(-MAX_HISTORY);
}
