// Impure shell: read an uploaded .xlsx File into the parser-agnostic grid shape
// consumed by the pure importer (import.ts).
//
// The xlsx parser (@e965/xlsx — a maintained, audit-clean SheetJS build on the
// npm registry) is loaded lazily so it never weighs down the initial bundle; it
// is only fetched the first time a user actually imports a spreadsheet.

import type { WorkbookData, Grid } from './import';

/** Read a spreadsheet File into { sheetName: rows[][] }. */
export async function fileToWorkbook(file: File): Promise<WorkbookData> {
  const XLSX = await import('@e965/xlsx');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const out: WorkbookData = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    out[name] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: true,
      blankrows: false,
      defval: null
    }) as Grid;
  }
  return out;
}
