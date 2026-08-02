import { describe, it, expect } from 'vitest';
import { importWorkbook, IMPORT_SPECS, type WorkbookData } from '../src/lib/import';
import type { Sheet } from '../src/lib/types';

// A miniature "Inventory Tracker" seed matching the real sheet's shape: a
// single collected total ("You Have") distributed across per-use requirement
// columns.
const inventory: Sheet = {
  id: 'inventory',
  title: 'Inventory Tracker',
  note: '',
  computed: true,
  columns: [
    { key: 'material', label: 'Material', type: 'label' },
    { key: 'biome', label: 'Biome / Location', type: 'meta' },
    { key: 'satchels', label: 'Satchels', type: 'tracked' },
    { key: 'camp', label: 'Camp', type: 'tracked' },
    { key: 'clothes', label: 'Trapper Clothes', type: 'tracked' },
    { key: 'saddles', label: 'Trapper Saddles', type: 'tracked' }
  ],
  rows: [
    { id: 'sec', section: true, label: 'PELTS' },
    {
      id: 'deer',
      cells: {
        material: { value: 'Deer Pelt' },
        satchels: { required: 7 },
        camp: { required: 0 },
        clothes: { required: 5 },
        saddles: { required: 0 }
      }
    },
    {
      id: 'alligator',
      cells: {
        material: { value: 'Alligator Skin' },
        satchels: { required: 0 },
        camp: { required: 1 },
        clothes: { required: 0 },
        saddles: { required: 1 }
      }
    },
    {
      id: 'zero',
      cells: {
        material: { value: 'Zero Need' },
        satchels: { required: 0 },
        camp: { required: 0 },
        clothes: { required: 0 },
        saddles: { required: 0 }
      }
    }
  ]
};

// A miniature "Reinforced Equipment" seed: two label columns identify a row,
// and a single bool "Done?" column is the user data.
const reinforced: Sheet = {
  id: 'reinforced',
  title: 'Reinforced Equipment',
  note: '',
  columns: [
    { key: 'set', label: 'Challenge Set', type: 'label' },
    { key: 'equipment', label: 'Equipment', type: 'label' },
    { key: 'cost', label: 'Cost', type: 'meta' },
    { key: 'done', label: 'Done?', type: 'bool' }
  ],
  rows: [
    {
      id: 'bandit-bandolier',
      cells: {
        set: { value: 'Bandit' },
        equipment: { value: 'Bandolier' },
        done: { required: 1 }
      }
    },
    {
      id: 'horseman-gloves',
      cells: {
        set: { value: 'Horseman' },
        equipment: { value: 'Gloves' },
        done: { required: 1 }
      }
    }
  ]
};

const INV_HEADER = [
  'Material',
  'Biome / Location',
  'You Have',
  'Satchels',
  'Camp',
  'Trapper\nClothes', // real header has a newline — must still match "Trapper Clothes"
  'Trapper\nSaddles',
  'Total\nNeeded',
  'Remaining',
  'Status'
];

function inventoryWorkbook(dataRows: WorkbookData['x']): WorkbookData {
  return {
    'Inventory Tracker': [
      ['RDR2 CRAFTING INVENTORY TRACKER'],
      ['Enter collected quantities in yellow cells.'],
      [],
      INV_HEADER,
      ['PELTS, HIDES & SKINS', null, null],
      ...dataRows
    ]
  };
}

describe('importWorkbook — inventory "You Have" allocation', () => {
  it('distributes the collected total across per-use requirement columns in order', () => {
    // Deer: have 7 → fills satchels (req 7) exactly; nothing left for clothes.
    const { delivered } = importWorkbook(
      inventoryWorkbook([['Deer Pelt', 'x', 7, 7, 0, 5, 0, 12, 5, 'NEED MORE']]),
      [inventory]
    );
    expect(delivered.inventory.deer).toEqual({ satchels: 7 });
  });

  it('reproduces the exact row total (Have) for a partially-filled material', () => {
    // Alligator: have 1 → camp (req 1). __have == 1, matching the sheet.
    const { delivered, summary } = importWorkbook(
      inventoryWorkbook([['Alligator Skin', 'x', 1, 0, 1, 0, 1, 2, 1, 'NEED MORE']]),
      [inventory]
    );
    expect(delivered.inventory.alligator).toEqual({ camp: 1 });
    expect(summary.collectedTotal).toBe(1);
    expect(summary.itemsImported).toBe(1);
    expect(summary.cellsWritten).toBe(1);
  });

  it('caps at total needed and drops surplus beyond requirements', () => {
    // have 20 but only needs 12 (7 + 5): satchels 7, clothes 5, nothing spills.
    const { delivered, summary } = importWorkbook(
      inventoryWorkbook([['Deer Pelt', 'x', 20, 7, 0, 5, 0, 12, 0, 'COMPLETE']]),
      [inventory]
    );
    expect(delivered.inventory.deer).toEqual({ satchels: 7, clothes: 5 });
    expect(summary.collectedTotal).toBe(12);
  });

  it('skips a material with data but no requirements (nothing to allocate)', () => {
    const { delivered, summary } = importWorkbook(
      inventoryWorkbook([['Zero Need', 'x', 3, 0, 0, 0, 0, 0, 3, 'NEED MORE']]),
      [inventory]
    );
    expect(delivered.inventory).toBeUndefined();
    expect(summary.itemsImported).toBe(0);
  });

  it('ignores rows with zero collected and blank/section rows', () => {
    const { delivered, summary } = importWorkbook(
      inventoryWorkbook([
        ['Deer Pelt', 'x', 0, 7, 0, 5, 0, 12, 12, 'NEED MORE'],
        [null, null, null]
      ]),
      [inventory]
    );
    expect(delivered.inventory).toBeUndefined();
    expect(summary.itemsImported).toBe(0);
  });

  it('records unmatched material names that carry data', () => {
    const { summary } = importWorkbook(
      inventoryWorkbook([
        ['Unicorn Horn', 'x', 2, 1, 0, 0, 0, 1, 0, 'COMPLETE'],
        [null, 'x', 4] // has data but no name → not reported
      ]),
      [inventory]
    );
    expect(summary.unmatched).toEqual(['Unicorn Horn']);
  });

  it('coerces messy numeric cells (strings, commas, decimals, negatives)', () => {
    const { delivered } = importWorkbook(
      inventoryWorkbook([['Deer Pelt', 'x', '3', 7, 0, 5, 0, 12, 9, 'NEED MORE']]),
      [inventory]
    );
    expect(delivered.inventory.deer).toEqual({ satchels: 3 });

    const neg = importWorkbook(
      inventoryWorkbook([['Deer Pelt', 'x', -5, 7, 0, 5, 0, 12, 12, 'NEED MORE']]),
      [inventory]
    );
    // Negative → 0 → skipped entirely.
    expect(neg.delivered.inventory).toBeUndefined();
  });
});

describe('importWorkbook — reinforced "Done?" checkboxes', () => {
  const wb = (doneCells: (string | number | boolean | null)[]): WorkbookData => ({
    'Reinforced Equipment': [
      ['TRAPPER - REINFORCED EQUIPMENT'],
      [],
      ['Challenge Set', 'Equipment', 'Cost', 'Done?'],
      ['Bandit', 'Bandolier', '$28.75', doneCells[0]],
      ['Horseman', 'Gloves', '$18.75', doneCells[1]]
    ]
  });

  it('marks a row done for common truthy checkbox values', () => {
    const { delivered, summary } = importWorkbook(wb(['x', true]), [reinforced]);
    expect(delivered.reinforced['bandit-bandolier']).toEqual({ done: 1 });
    expect(delivered.reinforced['horseman-gloves']).toEqual({ done: 1 });
    expect(summary.itemsImported).toBe(2);
    // Bool imports do not count toward collectedTotal.
    expect(summary.collectedTotal).toBe(0);
  });

  it('leaves un-checked rows alone', () => {
    const { delivered } = importWorkbook(wb(['', 0]), [reinforced]);
    expect(delivered.reinforced).toBeUndefined();
  });

  it('distinguishes rows that share an equipment name by their set', () => {
    const dup: Sheet = {
      ...reinforced,
      rows: [
        {
          id: 'a-gloves',
          cells: { set: { value: 'Alpha' }, equipment: { value: 'Gloves' }, done: { required: 1 } }
        },
        {
          id: 'b-gloves',
          cells: { set: { value: 'Beta' }, equipment: { value: 'Gloves' }, done: { required: 1 } }
        }
      ]
    };
    const wb2: WorkbookData = {
      'Reinforced Equipment': [
        ['Challenge Set', 'Equipment', 'Cost', 'Done?'],
        ['Alpha', 'Gloves', '$1', 'yes'],
        ['Beta', 'Gloves', '$1', '']
      ]
    };
    const { delivered } = importWorkbook(wb2, [dup]);
    expect(delivered.reinforced['a-gloves']).toEqual({ done: 1 });
    expect(delivered.reinforced['b-gloves']).toBeUndefined();
  });

  it('writes nothing when the sheet has no bool column', () => {
    const noBool: Sheet = {
      id: 'reinforced',
      title: 'Reinforced Equipment',
      note: '',
      columns: [
        { key: 'set', label: 'Challenge Set', type: 'label' },
        { key: 'equipment', label: 'Equipment', type: 'label' },
        { key: 'done', label: 'Done?', type: 'meta' }
      ],
      rows: [{ id: 'x', cells: { set: { value: 'Bandit' }, equipment: { value: 'Bandolier' } } }]
    };
    const wb2: WorkbookData = {
      'Reinforced Equipment': [
        ['Challenge Set', 'Equipment', 'Done?'],
        ['Bandit', 'Bandolier', 'x']
      ]
    };
    const { delivered, summary } = importWorkbook(wb2, [noBool]);
    expect(delivered.reinforced).toBeUndefined();
    expect(summary.itemsImported).toBe(0);
  });
});

describe('importWorkbook — sheet/header matching', () => {
  it('skips a spec whose seed sheet is absent', () => {
    // Only the inventory sheet is provided; the reinforced spec is skipped.
    const { delivered } = importWorkbook(
      inventoryWorkbook([['Deer Pelt', 'x', 7, 7, 0, 5, 0, 12, 5, '']]),
      [inventory]
    );
    expect(Object.keys(delivered)).toEqual(['inventory']);
  });

  it('skips a sheet missing from the workbook', () => {
    const { delivered } = importWorkbook({ 'Some Other Sheet': [[1, 2, 3]] }, [inventory]);
    expect(delivered).toEqual({});
  });

  it('skips a sheet whose header row cannot be found', () => {
    const wb: WorkbookData = {
      'Inventory Tracker': [
        ['Material', 'Biome / Location'], // no "You Have" column present
        ['Deer Pelt', 'somewhere']
      ]
    };
    const { delivered, summary } = importWorkbook(wb, [inventory]);
    expect(delivered).toEqual({});
    expect(summary.itemsImported).toBe(0);
  });

  it('matches sheet titles and headers case/whitespace-insensitively', () => {
    const wb: WorkbookData = {
      '  inventory tracker  ': [
        ['material', 'biome / location', 'YOU HAVE', 'satchels', 'camp', 'trapper clothes'],
        ['deer pelt', 'x', 4, 7, 0, 5, 0]
      ]
    };
    const { delivered } = importWorkbook(wb, [inventory]);
    expect(delivered.inventory.deer).toEqual({ satchels: 4 });
  });

  it('uses the real seed (default arg) and maps a known material to its row id', () => {
    // Alligator Skin is inventory-6 in the generated seed; Camp requires 1.
    const wb = inventoryWorkbook([['Alligator Skin', 'x', 1, 0, 1, 0, 1, 2, 1, 'NEED MORE']]);
    const { delivered } = importWorkbook(wb); // no explicit sheets → real SHEETS
    expect(delivered.inventory['inventory-6']).toEqual({ camp: 1 });
  });
});

describe('importWorkbook — defensive handling of sparse/partial data', () => {
  it('tolerates holes in the row array (sparse sheets)', () => {
    // A sparse grid: holes before the header and between data rows. Some xlsx
    // exporters leave gaps; iteration must not blow up on undefined rows.
    const grid: WorkbookData['x'] = [];
    grid[1] = INV_HEADER;
    grid[3] = ['Deer Pelt', 'x', 7, 7, 0, 5, 0, 12, 5, 'NEED MORE'];
    const { delivered } = importWorkbook({ 'Inventory Tracker': grid }, [inventory]);
    expect(delivered.inventory.deer).toEqual({ satchels: 7 });
  });

  it('treats a tracked cell with no declared requirement as needing zero', () => {
    const partial: Sheet = {
      ...inventory,
      rows: [
        {
          id: 'deer',
          cells: {
            material: { value: 'Deer Pelt' },
            // satchels cell omitted entirely; camp has no `required` field.
            camp: {},
            clothes: { required: 5 }
          }
        }
      ]
    };
    const { delivered } = importWorkbook(
      inventoryWorkbook([['Deer Pelt', 'x', 3, 7, 0, 5, 0, 12, 9, 'NEED MORE']]),
      [partial]
    );
    // satchels/camp contribute 0 requirement → the 3 land in clothes.
    expect(delivered.inventory.deer).toEqual({ clothes: 3 });
  });
});

describe('IMPORT_SPECS', () => {
  it('only declares the two genuinely user-editable sources', () => {
    expect(IMPORT_SPECS).toEqual([
      { sheetId: 'inventory', mode: 'aggregate', sourceHeader: 'You Have' },
      { sheetId: 'reinforced', mode: 'bool', sourceHeader: 'Done?' }
    ]);
  });
});
