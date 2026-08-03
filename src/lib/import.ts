// Pure importer: turn a parsed spreadsheet (sheet name → grid of cell values)
// into a DeliveredMap that can be merged into a playthrough.
//
// The source workbook (RDR2_Crafting_Tracker_v3.xlsx — what the seed is
// generated from) holds the user's actual progress in exactly two places, the
// only two SOURCE columns (declared explicitly in IMPORT_SPECS so requirements
// are never mistaken for progress):
//
//   • Inventory Tracker → the single "You Have" column (how many of each
//     material you've collected). The per-use columns next to it (Satchels,
//     Camp, Trapper Clothes, Trapper Saddles) are static *requirements*, not
//     progress, so they are never read as input.
//   • Reinforced Equipment → the "Done?" column (a per-row checkbox).
//
// The collected "You Have" totals then also flow *outward* into the crafting
// recipe tabs (Satchels, Camp, Trapper garments/individual/saddles — see
// MATERIAL_CONSUMER_SHEET_IDS): owning the pelts a recipe needs advances that
// recipe. Each material's collected total is spread across those tabs in
// priority order (satchels → camp → trapper) until it runs out, so the same
// progress a player has is reflected on every tab that consumes it — not just
// the Inventory Tracker's own columns.
//
// This module is framework-free and fully unit-tested; the xlsx → grid step
// (the impure part) lives in xlsx.ts.

import type { DeliveredMap, Sheet, SeedRow } from './types';
import { SHEETS } from './seed';

export type CellValue = string | number | boolean | null | undefined;
export type Grid = CellValue[][];
/** A workbook as sheet name → rows → cells (what `xlsx.ts` produces). */
export type WorkbookData = Record<string, Grid>;

/** How a sheet's user data is laid out in the source workbook. */
interface ImportSpec {
  /** Seed sheet id this spec applies to. */
  sheetId: string;
  /**
   * - `aggregate`: one source column holds a single collected total per row,
   *   distributed across that row's tracked columns (capped at each required).
   * - `bool`: one source column is a checkbox mapped to the sheet's bool column.
   */
  mode: 'aggregate' | 'bool';
  /** Header text of the source column that actually holds user progress. */
  sourceHeader: string;
}

export const IMPORT_SPECS: ImportSpec[] = [
  { sheetId: 'inventory', mode: 'aggregate', sourceHeader: 'You Have' },
  { sheetId: 'reinforced', mode: 'bool', sourceHeader: 'Done?' }
];

/**
 * Crafting recipe tabs whose tracked "Qty" columns consume the raw materials
 * the player collects. The workbook holds no direct progress for these — their
 * qtys are recipe *requirements* — but a material collected in the Inventory
 * Tracker ("You Have") can satisfy them. Each material's collected total is
 * distributed across these tabs **in this priority order**, filling each recipe
 * up to its required qty until the material runs out: Satchels first, then Camp,
 * then the Trapper tabs (garments/individual before saddles) — mirroring the
 * Inventory Tracker's own column order (Satchels, Camp, Clothes, Saddles).
 */
export const MATERIAL_CONSUMER_SHEET_IDS = [
  'satchels',
  'camp',
  'garments',
  'individual',
  'saddles'
] as const;

export interface ImportSummary {
  /** Rows for which at least one delivered value was written. */
  itemsImported: number;
  /** Total delivered cells written. */
  cellsWritten: number;
  /** Sum of collected ("You Have") amounts imported. */
  collectedTotal: number;
  /** Source row names that carried data but matched no known item. */
  unmatched: string[];
}

export interface ImportOutcome {
  delivered: DeliveredMap;
  summary: ImportSummary;
}

/** Normalise a cell/header for comparison: collapse whitespace, trim, lower. */
function norm(v: CellValue): string {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Coerce a cell to a non-negative integer (0 when blank/non-numeric). */
function toCount(v: CellValue): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** A checkbox/"done" cell is truthy for common spreadsheet conventions. */
function isTruthy(v: CellValue): boolean {
  if (v == null || v === '') return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return ['x', 'yes', 'y', 'true', 'done', '✓', '✔', '1'].includes(norm(v));
}

/** Column keys the app treats as user-editable progress on a sheet. */
function trackedKeys(sheet: Sheet): string[] {
  return sheet.columns.filter((c) => c.type === 'tracked' || c.type === 'bool').map((c) => c.key);
}

/** The seed sheet's label columns, used to identify a row across the workbook. */
function labelColumns(sheet: Sheet) {
  return sheet.columns.filter((c) => c.type === 'label');
}

/** Identity of a seed row: its label-column values joined + normalised. */
function seedRowIdentity(sheet: Sheet, row: SeedRow): string {
  return labelColumns(sheet)
    .map((c) => norm(row.cells?.[c.key]?.value))
    .join(' | ');
}

interface HeaderInfo {
  headerRow: number;
  /** seed label column key → grid column index */
  labelCols: Record<string, number>;
  /** grid column index of the source (progress) column */
  sourceCol: number;
}

/**
 * Locate the header row and the columns we care about. The header row is the
 * first row that contains every one of the sheet's label headers plus the
 * source header. Returns null when the sheet doesn't look like this one.
 */
function findHeader(grid: Grid, sheet: Sheet, sourceHeader: string): HeaderInfo | null {
  const labels = labelColumns(sheet);
  const wantLabels = labels.map((c) => norm(c.label));
  const wantSource = norm(sourceHeader);

  for (let r = 0; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    const normed = cells.map(norm);
    const hasAllLabels = wantLabels.every((w) => normed.includes(w));
    const sourceCol = normed.indexOf(wantSource);
    if (hasAllLabels && sourceCol !== -1) {
      const labelCols: Record<string, number> = {};
      for (let i = 0; i < labels.length; i++) {
        labelCols[labels[i].key] = normed.indexOf(wantLabels[i]);
      }
      return { headerRow: r, labelCols, sourceCol };
    }
  }
  return null;
}

/** Identity of a grid data row, built from the mapped label columns. */
function gridRowIdentity(row: Grid[number], sheet: Sheet, header: HeaderInfo): string {
  return labelColumns(sheet)
    .map((c) => norm(row[header.labelCols[c.key]]))
    .join(' | ');
}

/**
 * Pair each tracked column with the ingredient *label* column that precedes it,
 * so a crafting recipe row's "Qty" cell can be tied back to the material it
 * consumes. Matches the Satchels/Camp/Trapper layout (ing1→qty1, ing2→qty2, …;
 * ingredient→qty for saddles).
 */
function ingredientPairs(sheet: Sheet): { ingKey: string; qtyKey: string }[] {
  const pairs: { ingKey: string; qtyKey: string }[] = [];
  let lastLabel: string | null = null;
  for (const c of sheet.columns) {
    if (c.type === 'label') lastLabel = c.key;
    else if (c.type === 'tracked' && lastLabel) pairs.push({ ingKey: lastLabel, qtyKey: c.key });
  }
  return pairs;
}

/**
 * Distribute the collected-material pool (material name → count) across the
 * crafting recipe tabs, in the priority order of MATERIAL_CONSUMER_SHEET_IDS.
 * For each recipe cell whose ingredient the player has collected, fill its qty
 * up to the required amount and draw the pool down; once a material runs out,
 * lower-priority recipes for it are left untouched. Mutates `delivered`/`summary`.
 */
function allocateConsumers(
  pool: Map<string, number>,
  sheets: Sheet[],
  delivered: DeliveredMap,
  summary: ImportSummary
): void {
  for (const sheetId of MATERIAL_CONSUMER_SHEET_IDS) {
    const sheet = sheets.find((s) => s.id === sheetId);
    if (!sheet) continue;
    const pairs = ingredientPairs(sheet);
    for (const row of sheet.rows) {
      if (row.section || !row.cells) continue;
      let rowWrote = false;
      for (const { ingKey, qtyKey } of pairs) {
        const name = norm(row.cells[ingKey]?.value);
        if (!name) continue;
        const have = pool.get(name) ?? 0;
        if (have <= 0) continue;
        const req = row.cells[qtyKey]?.required ?? 0;
        if (req <= 0) continue;
        const take = Math.min(req, have);
        const sheetMap = (delivered[sheet.id] ??= {});
        sheetMap[row.id] = { ...(sheetMap[row.id] ?? {}), [qtyKey]: take };
        pool.set(name, have - take);
        summary.cellsWritten++;
        rowWrote = true;
      }
      if (rowWrote) summary.itemsImported++;
    }
  }
}

/**
 * Distribute a single collected total across a row's tracked columns, filling
 * each up to its required amount in column order. Surplus beyond everything the
 * row needs is dropped (the app tracks progress toward requirements, and the
 * row still reads as complete).
 */
function allocate(sheet: Sheet, row: SeedRow, amount: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = amount;
  for (const key of trackedKeys(sheet)) {
    if (left <= 0) break;
    const req = row.cells?.[key]?.required ?? 0;
    if (req <= 0) continue;
    const take = Math.min(req, left);
    out[key] = take;
    left -= take;
  }
  return out;
}

/**
 * Parse a workbook into a DeliveredMap plus a human-readable summary. Pure: the
 * result is deterministic and safe to merge (keep-higher) into a playthrough.
 */
export function importWorkbook(wb: WorkbookData, sheets: Sheet[] = SHEETS): ImportOutcome {
  const delivered: DeliveredMap = {};
  const summary: ImportSummary = {
    itemsImported: 0,
    cellsWritten: 0,
    collectedTotal: 0,
    unmatched: []
  };

  // Match workbook sheets to seed sheets by (normalised) title.
  const gridByTitle = new Map<string, Grid>();
  for (const [name, grid] of Object.entries(wb)) gridByTitle.set(norm(name), grid);

  // Collected raw-material totals (material name → count), gathered from the
  // aggregate "You Have" source. Fed to the crafting tabs after the primary
  // sources are read, so pelts you own also fill their recipe requirements.
  const materialPool = new Map<string, number>();

  for (const spec of IMPORT_SPECS) {
    const sheet = sheets.find((s) => s.id === spec.sheetId);
    if (!sheet) continue;
    const grid = gridByTitle.get(norm(sheet.title));
    if (!grid) continue;
    const header = findHeader(grid, sheet, spec.sourceHeader);
    if (!header) continue;

    // Index seed rows by identity for O(1) lookup.
    const seedByIdentity = new Map<string, SeedRow>();
    for (const row of sheet.rows) {
      if (row.section || !row.cells) continue;
      seedByIdentity.set(seedRowIdentity(sheet, row), row);
    }
    const boolKey = sheet.columns.find((c) => c.type === 'bool')?.key;

    for (let r = header.headerRow + 1; r < grid.length; r++) {
      const gridRow = grid[r] ?? [];
      const rawSource = gridRow[header.sourceCol];
      const hasData = spec.mode === 'aggregate' ? toCount(rawSource) > 0 : isTruthy(rawSource);
      if (!hasData) continue;

      const identity = gridRowIdentity(gridRow, sheet, header);

      // Record the collected total into the material pool (aggregate sources
      // only — a "You Have" count keyed by the material's name).
      if (spec.mode === 'aggregate') {
        materialPool.set(identity, (materialPool.get(identity) ?? 0) + toCount(rawSource));
      }

      const seedRow = seedByIdentity.get(identity);
      if (!seedRow) {
        // Report the first label value so the user can see what was skipped.
        const firstLabel = String(
          gridRow[header.labelCols[labelColumns(sheet)[0].key]] ?? ''
        ).trim();
        if (firstLabel) summary.unmatched.push(firstLabel);
        continue;
      }

      const cells =
        spec.mode === 'aggregate'
          ? allocate(sheet, seedRow, toCount(rawSource))
          : boolKey
            ? { [boolKey]: 1 }
            : {};

      const keys = Object.keys(cells);
      if (keys.length === 0) continue;
      const sheetMap = (delivered[sheet.id] ??= {});
      sheetMap[seedRow.id] = { ...(sheetMap[seedRow.id] ?? {}), ...cells };
      summary.itemsImported++;
      summary.cellsWritten += keys.length;
      if (spec.mode === 'aggregate') {
        summary.collectedTotal += keys.reduce((sum, k) => sum + cells[k], 0);
      }
    }
  }

  // Spread collected raw materials across the crafting recipe tabs (satchels →
  // camp → trapper), so owning the pelts also advances the recipes that use them.
  allocateConsumers(materialPool, sheets, delivered, summary);

  return { delivered, summary };
}
