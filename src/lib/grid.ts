// Pure helpers describing how a sheet is laid out as a grid. Kept out of the
// Svelte component so the layout rules are unit-testable.

import type { Column, Sheet } from './types';
import type { RowTotals } from './compute';

export interface DisplayColumn extends Column {
  computed?: boolean;
}

/** Computed columns appended to sheets flagged `computed` (the main inventory). */
export const COMPUTED_COLUMNS: DisplayColumn[] = [
  { key: '__have', label: 'Have', type: 'meta', computed: true },
  { key: '__needed', label: 'Needed', type: 'meta', computed: true },
  { key: '__remaining', label: 'Remaining', type: 'meta', computed: true },
  { key: '__status', label: 'Status', type: 'meta', computed: true }
];

/** The full ordered column list the grid renders, including computed columns. */
export function buildDisplayColumns(sheet: Sheet): DisplayColumn[] {
  const base: DisplayColumn[] = sheet.columns.map((c) => ({ ...c }));
  return sheet.computed ? [...base, ...COMPUTED_COLUMNS] : base;
}

/** Key of the column used as the row header (`<th scope="row">`): the first
 *  label column, or null if the sheet has none. */
export function rowHeaderKey(sheet: Sheet): string | null {
  const first = sheet.columns.find((c) => c.type === 'label');
  return first ? first.key : null;
}

export type StatusKind = 'complete' | 'partial' | 'todo' | 'none';

export interface StatusInfo {
  kind: StatusKind;
  text: string;
}

/** Text + kind for a row's status, never relying on colour alone (WCAG 1.4.1). */
export function statusInfo(totals: RowTotals): StatusInfo {
  if (totals.needed <= 0) return { kind: 'none', text: '—' };
  if (totals.complete) return { kind: 'complete', text: 'Complete' };
  if (totals.started) return { kind: 'partial', text: `${totals.remaining} to go` };
  return { kind: 'todo', text: 'Need more' };
}
