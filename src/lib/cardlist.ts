// Pure logic for the mobile card-list view: turn a sheet + delivered map into a
// flat list of trackable "cards", and search/filter/count them. Kept
// framework-free so the rules are unit-testable in isolation (see grid.ts).

import type { DeliveredMap, Sheet, SeedRow } from './types';
import { getDelivered, rowTotals, type RowTotals } from './compute';
import { rowHeaderKey } from './grid';

export type CardStatus = 'todo' | 'partial' | 'complete';
export type CardFilter = 'all' | 'todo' | 'partial' | 'done';

export interface CardPart {
  colKey: string;
  /** Ingredient name (recipes) or the tracked column's own label (inventory). */
  label: string;
  kind: 'tracked' | 'bool';
  required: number;
  delivered: number;
}

export interface CardItem {
  rowId: string;
  name: string;
  sub: string;
  section: string | null;
  parts: CardPart[];
  totals: RowTotals;
  status: CardStatus;
}

/** Ingredient-name columns are paired with a tracked qty column and are never
 *  shown as a card subtitle. Recipe sheets use `ing1..ingN`; saddles use a
 *  single `ingredient`. */
function isIngredientCol(key: string): boolean {
  return /^ing\d+$/.test(key) || key === 'ingredient';
}

/** Column used for the card subtitle: the first descriptive meta column
 *  (biome, benefit, cost…), never an ingredient-name column. */
function subKey(sheet: Sheet): string | null {
  const col = sheet.columns.find((c) => c.type === 'meta' && !isIngredientCol(c.key));
  return col ? col.key : null;
}

/** Human label for a tracked/bool part. A `qtyN` (or lone `qty`) column takes
 *  its label from the paired ingredient-name cell on the same row; everything
 *  else uses the column's own label. */
function partLabel(row: SeedRow, colKey: string, colLabel: string): string {
  const numbered = /^qty(\d+)$/.exec(colKey);
  const ingKey = numbered ? `ing${numbered[1]}` : colKey === 'qty' ? 'ingredient' : null;
  if (ingKey) {
    const name = row.cells?.[ingKey]?.value;
    if (name) return name;
  }
  return colLabel;
}

function statusOf(totals: RowTotals): CardStatus {
  if (totals.complete) return 'complete';
  if (totals.started) return 'partial';
  return 'todo';
}

/** Flatten a sheet into cards: one per trackable data row (rows with no
 *  required amounts, and section headers, are skipped). Section membership is
 *  carried onto each card so the view can group them. */
export function buildCards(sheet: Sheet, delivered: DeliveredMap): CardItem[] {
  const nameKey = rowHeaderKey(sheet);
  const subCol = subKey(sheet);
  const cards: CardItem[] = [];
  let section: string | null = null;

  for (const row of sheet.rows) {
    if (row.section) {
      section = row.label ?? null;
      continue;
    }
    if (!row.cells) continue;

    const parts: CardPart[] = [];
    for (const col of sheet.columns) {
      if (col.type !== 'tracked' && col.type !== 'bool') continue;
      const cell = row.cells[col.key];
      if (!cell || cell.required == null) continue;
      parts.push({
        colKey: col.key,
        label: partLabel(row, col.key, col.label),
        kind: col.type === 'bool' ? 'bool' : 'tracked',
        required: cell.required,
        delivered: getDelivered(delivered, sheet.id, row.id, col.key)
      });
    }
    if (parts.length === 0) continue;

    const totals = rowTotals(sheet, row, delivered);
    // Nothing to collect (every tracked amount is zero) → not a trackable card.
    if (totals.needed <= 0) continue;
    cards.push({
      rowId: row.id,
      name: (nameKey && row.cells[nameKey]?.value) || '',
      sub: (subCol && row.cells[subCol]?.value) || '',
      section,
      parts,
      totals,
      status: statusOf(totals)
    });
  }
  return cards;
}

/** True when the query matches the card's name or subtitle (case-insensitive). */
export function matchesQuery(card: CardItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return card.name.toLowerCase().includes(q) || card.sub.toLowerCase().includes(q);
}

/** True when a card's status belongs in the selected filter bucket. */
export function matchesFilter(status: CardStatus, filter: CardFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'done') return status === 'complete';
  return status === filter;
}

export function filterCards(
  cards: CardItem[],
  opts: { query: string; filter: CardFilter }
): CardItem[] {
  return cards.filter(
    (c) => matchesFilter(c.status, opts.filter) && matchesQuery(c, opts.query)
  );
}

/** Card counts for each filter chip. */
export function filterCounts(cards: CardItem[]): Record<CardFilter, number> {
  const counts: Record<CardFilter, number> = { all: cards.length, todo: 0, partial: 0, done: 0 };
  for (const c of cards) {
    if (c.status === 'complete') counts.done++;
    else counts[c.status]++;
  }
  return counts;
}
