// Core data model shared by the seed template and the runtime stores.

export type ColumnType = 'label' | 'meta' | 'tracked' | 'bool';

export interface Column {
  key: string;
  label: string;
  type: ColumnType;
}

/** A cell in the static template. Tracked/bool cells carry a `required`
 *  amount; label/meta cells carry a display `value`. */
export interface SeedCell {
  required?: number;
  value?: string;
}

export interface SeedRow {
  id: string;
  /** Section header row (spans the grid, e.g. "PELTS, HIDES & SKINS"). */
  section?: boolean;
  label?: string;
  cells?: Record<string, SeedCell>;
}

export interface Sheet {
  id: string;
  title: string;
  note: string;
  columns: Column[];
  rows: SeedRow[];
  /** When true, extra computed columns (Have / Needed / Remaining / Status)
   *  are appended by the grid. Used by the main inventory sheet. */
  computed?: boolean;
}

/** Per-iteration progress: delivered[sheetId][rowId][colKey] = delivered amount.
 *  Required amounts live in the static seed, so only deltas are persisted. */
export type DeliveredMap = Record<string, Record<string, Record<string, number>>>;

export interface FreezeState {
  /** Column keys pinned to the left, per sheet. */
  cols: Record<string, string[]>;
  /** Row ids pinned to the top, per sheet. */
  rows: Record<string, string[]>;
}

/** A point-in-time snapshot of delivered progress, recorded so bulk actions
 *  can be reviewed and undone. Append-only. */
export interface HistoryEntry {
  id: string;
  at: number;
  label: string;
  delivered: DeliveredMap;
}

export interface Iteration {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  delivered: DeliveredMap;
  freeze: FreezeState;
  history: HistoryEntry[];
}

/** Metadata-only view used for the iteration list. */
export interface IterationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export type StorageMode = 'firebase' | 'local';
