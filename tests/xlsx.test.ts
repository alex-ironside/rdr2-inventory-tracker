import { describe, it, expect } from 'vitest';
import * as XLSX from '@e965/xlsx';
import { fileToWorkbook } from '../src/lib/xlsx';

// Build a real .xlsx in memory and wrap it in a File, then read it back through
// the shell. This exercises the actual parser (not a mock), so the shape the
// pure importer receives is verified end-to-end.
function makeXlsxFile(sheets: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  const written = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | Uint8Array;
  const ab = written instanceof Uint8Array ? written.buffer : written;
  const file = new File([ab], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  // jsdom's File does not implement arrayBuffer(); all target browsers do.
  Object.defineProperty(file, 'arrayBuffer', { value: async () => ab });
  return file;
}

describe('fileToWorkbook', () => {
  it('reads every sheet into a header-indexed grid of raw values', async () => {
    const file = makeXlsxFile({
      'Inventory Tracker': [
        ['Material', 'You Have', 'Camp'],
        ['Alligator Skin', 1, 1],
        ['Deer Pelt', 7, 0]
      ],
      'Reinforced Equipment': [
        ['Challenge Set', 'Equipment', 'Done?'],
        ['Bandit', 'Bandolier', 'x']
      ]
    });

    const wb = await fileToWorkbook(file);

    expect(Object.keys(wb)).toEqual(['Inventory Tracker', 'Reinforced Equipment']);
    expect(wb['Inventory Tracker'][0]).toEqual(['Material', 'You Have', 'Camp']);
    // Numbers come back as numbers (raw: true), not strings.
    expect(wb['Inventory Tracker'][2]).toEqual(['Deer Pelt', 7, 0]);
    expect(wb['Reinforced Equipment'][1]).toEqual(['Bandit', 'Bandolier', 'x']);
  });

  it('produces a workbook the importer can consume', async () => {
    // Integration sanity: the shell output feeds straight into importWorkbook.
    const { importWorkbook } = await import('../src/lib/import');
    const file = makeXlsxFile({
      'Inventory Tracker': [
        [
          'Material',
          'Biome / Location',
          'You Have',
          'Satchels',
          'Camp',
          'Trapper Clothes',
          'Trapper Saddles'
        ],
        ['Alligator Skin', 'Swamps', 1, 0, 1, 0, 1]
      ]
    });
    const wb = await fileToWorkbook(file);
    const { delivered } = importWorkbook(wb);
    expect(delivered.inventory['inventory-6']).toEqual({ camp: 1 });
  });
});
