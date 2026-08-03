import { describe, it, expect } from 'vitest';
import {
  buildCards,
  filterCards,
  filterCounts,
  matchesQuery,
  matchesFilter,
  type CardItem
} from '../src/lib/cardlist';
import type { Sheet, DeliveredMap } from '../src/lib/types';

// --- Synthetic sheets that mirror the real seed shapes ---

/** Inventory: label + descriptive meta + several tracked columns (own labels). */
const inv: Sheet = {
  id: 'inv',
  title: 'Inventory',
  note: '',
  computed: true,
  columns: [
    { key: 'material', label: 'Material', type: 'label' },
    { key: 'biome', label: 'Biome', type: 'meta' },
    { key: 'satchels', label: 'Satchels', type: 'tracked' },
    { key: 'camp', label: 'Camp', type: 'tracked' }
  ],
  rows: [
    { id: 'sec1', section: true, label: 'PELTS' },
    {
      id: 'r1',
      cells: {
        material: { value: 'Beaver Pelt' },
        biome: { value: 'Grizzlies' },
        satchels: { required: 2 },
        camp: { required: 1 }
      }
    },
    {
      id: 'r2',
      cells: {
        material: { value: 'Deer Pelt' },
        biome: { value: 'West Elizabeth' },
        satchels: { required: 1 }
        // camp intentionally absent → not a part
      }
    },
    {
      id: 'r3',
      // No tracked requirements → nothing to track → excluded from cards.
      cells: { material: { value: 'Ambient Rock' }, biome: { value: 'Everywhere' } }
    }
  ]
};

/** Recipe sheet: qtyN tracked columns paired with ingN name columns. */
const recipe: Sheet = {
  id: 'sat',
  title: 'Satchels',
  note: '',
  columns: [
    { key: 'satchel', label: 'Satchel', type: 'label' },
    { key: 'benefit', label: 'Benefit', type: 'meta' },
    { key: 'ing1', label: 'Ingredient', type: 'meta' },
    { key: 'qty1', label: 'Qty', type: 'tracked' },
    { key: 'ing2', label: 'Ingredient', type: 'meta' },
    { key: 'qty2', label: 'Qty', type: 'tracked' }
  ],
  rows: [
    {
      id: 's1',
      cells: {
        satchel: { value: 'Big Game Satchel' },
        benefit: { value: '+ Big game carry' },
        ing1: { value: 'Perfect Deer Pelt' },
        qty1: { required: 1 },
        ing2: { value: 'Perfect Raccoon Pelt' },
        qty2: { required: 1 }
      }
    },
    {
      id: 's2',
      cells: {
        satchel: { value: 'Kit Satchel' },
        benefit: { value: '+ Kit slots' },
        // ing1 value missing → part label falls back to the column label.
        qty1: { required: 3 }
      }
    }
  ]
};

/** Saddle sheet: a single `qty` tracked column paired with `ingredient`. */
const saddle: Sheet = {
  id: 'sad',
  title: 'Saddles',
  note: '',
  columns: [
    { key: 'saddle', label: 'Saddle', type: 'label' },
    { key: 'ingredient', label: 'Ingredient', type: 'meta' },
    { key: 'qty', label: 'Qty', type: 'tracked' }
  ],
  rows: [
    {
      id: 'd1',
      cells: {
        saddle: { value: 'Nacogdoches Saddle' },
        ingredient: { value: 'Perfect Cougar Pelt' },
        qty: { required: 1 }
      }
    }
  ]
};

/** Reinforced: a single boolean "done" column. */
const reinforced: Sheet = {
  id: 'rei',
  title: 'Reinforced',
  note: '',
  columns: [
    { key: 'set', label: 'Set', type: 'label' },
    { key: 'equipment', label: 'Equipment', type: 'meta' },
    { key: 'done', label: 'Done?', type: 'bool' }
  ],
  rows: [
    {
      id: 'x1',
      cells: {
        set: { value: 'Sharpshooter' },
        equipment: { value: 'Reinforced Gun Belt' },
        done: { required: 1 }
      }
    }
  ]
};

describe('buildCards', () => {
  it('builds one card per trackable data row, skipping sections and no-requirement rows', () => {
    const cards = buildCards(inv, {});
    expect(cards.map((c) => c.rowId)).toEqual(['r1', 'r2']); // r3 excluded, section skipped
  });

  it('derives name, subtitle and section from the label + first descriptive meta column', () => {
    const [beaver] = buildCards(inv, {});
    expect(beaver.name).toBe('Beaver Pelt');
    expect(beaver.sub).toBe('Grizzlies');
    expect(beaver.section).toBe('PELTS');
  });

  it('includes only tracked columns that carry a required amount, labelled by column', () => {
    const [beaver, deer] = buildCards(inv, {});
    expect(beaver.parts).toEqual([
      { colKey: 'satchels', label: 'Satchels', kind: 'tracked', required: 2, delivered: 0 },
      { colKey: 'camp', label: 'Camp', kind: 'tracked', required: 1, delivered: 0 }
    ]);
    // Deer has no camp requirement, so only one part.
    expect(deer.parts.map((p) => p.colKey)).toEqual(['satchels']);
  });

  it('reflects delivered amounts and derives status (todo / partial / complete)', () => {
    expect(buildCards(inv, {})[0].status).toBe('todo');
    expect(buildCards(inv, { inv: { r1: { satchels: 1 } } })[0].status).toBe('partial');
    const done = buildCards(inv, { inv: { r1: { satchels: 2, camp: 1 } } })[0];
    expect(done.status).toBe('complete');
    expect(done.totals.have).toBe(3);
    expect(done.parts[0].delivered).toBe(2);
  });

  it('labels recipe parts with the paired ingredient name, falling back to the column label', () => {
    const [bigGame, kit] = buildCards(recipe, {});
    expect(bigGame.parts.map((p) => p.label)).toEqual([
      'Perfect Deer Pelt',
      'Perfect Raccoon Pelt'
    ]);
    // Missing ing1 value → falls back to the "Qty" column label.
    expect(kit.parts[0].label).toBe('Qty');
  });

  it('pairs a lone `qty` column with the `ingredient` name column', () => {
    const [nac] = buildCards(saddle, {});
    expect(nac.parts[0].label).toBe('Perfect Cougar Pelt');
    expect(nac.section).toBeNull(); // no section rows
  });

  it('handles boolean "done" columns as a single part', () => {
    const [belt] = buildCards(reinforced, {});
    expect(belt.parts).toEqual([
      { colKey: 'done', label: 'Done?', kind: 'bool', required: 1, delivered: 0 }
    ]);
    expect(belt.status).toBe('todo');
    expect(buildCards(reinforced, { rei: { x1: { done: 1 } } })[0].status).toBe('complete');
  });

  it('excludes rows whose tracked columns all require zero', () => {
    const zeroSheet: Sheet = {
      id: 'z',
      title: 'Zero',
      note: '',
      columns: [
        { key: 'name', label: 'Name', type: 'label' },
        { key: 'satchels', label: 'Satchels', type: 'tracked' }
      ],
      rows: [{ id: 'z1', cells: { name: { value: 'Freebie' }, satchels: { required: 0 } } }]
    };
    expect(buildCards(zeroSheet, {})).toEqual([]);
  });

  it('leaves the subtitle empty when there is no descriptive meta column', () => {
    // The saddle sheet's only meta column is the ingredient column, which is
    // never used as a subtitle.
    expect(buildCards(saddle, {})[0].sub).toBe('');
  });

  it('treats a section row without a label as no section', () => {
    const s: Sheet = {
      id: 's',
      title: 'S',
      note: '',
      columns: [
        { key: 'name', label: 'Name', type: 'label' },
        { key: 'satchels', label: 'Satchels', type: 'tracked' }
      ],
      rows: [
        { id: 'sec', section: true }, // no label
        { id: 'r', cells: { name: { value: 'Thing' }, satchels: { required: 1 } } }
      ]
    };
    expect(buildCards(s, {})[0].section).toBeNull();
  });

  it('skips data rows that carry no cells', () => {
    const s: Sheet = {
      id: 's',
      title: 'S',
      note: '',
      columns: [{ key: 'satchels', label: 'Satchels', type: 'tracked' }],
      rows: [{ id: 'empty' }, { id: 'r', cells: { satchels: { required: 1 } } }]
    };
    expect(buildCards(s, {}).map((c) => c.rowId)).toEqual(['r']);
  });

  it('falls back to an empty name when there is no label column or value', () => {
    // No label column at all → nameKey is null.
    const noLabel: Sheet = {
      id: 'nl',
      title: 'NL',
      note: '',
      columns: [{ key: 'satchels', label: 'Satchels', type: 'tracked' }],
      rows: [{ id: 'r', cells: { satchels: { required: 1 } } }]
    };
    expect(buildCards(noLabel, {})[0].name).toBe('');

    // Label column exists but the row omits that cell.
    const missing: Sheet = {
      id: 'ms',
      title: 'MS',
      note: '',
      columns: [
        { key: 'name', label: 'Name', type: 'label' },
        { key: 'satchels', label: 'Satchels', type: 'tracked' }
      ],
      rows: [{ id: 'r', cells: { satchels: { required: 1 } } }]
    };
    expect(buildCards(missing, {})[0].name).toBe('');
  });
});

describe('matchesQuery', () => {
  const card = buildCards(inv, {})[0]; // Beaver Pelt / Grizzlies

  it('matches when the query is empty', () => {
    expect(matchesQuery(card, '')).toBe(true);
  });
  it('matches the name case-insensitively', () => {
    expect(matchesQuery(card, 'beaver')).toBe(true);
  });
  it('matches the subtitle', () => {
    expect(matchesQuery(card, 'grizz')).toBe(true);
  });
  it('does not match unrelated text', () => {
    expect(matchesQuery(card, 'zebra')).toBe(false);
  });
});

describe('matchesFilter', () => {
  it('passes everything for "all"', () => {
    expect(matchesFilter('todo', 'all')).toBe(true);
    expect(matchesFilter('complete', 'all')).toBe(true);
  });
  it('maps "done" to complete', () => {
    expect(matchesFilter('complete', 'done')).toBe(true);
    expect(matchesFilter('partial', 'done')).toBe(false);
  });
  it('matches todo and partial directly', () => {
    expect(matchesFilter('todo', 'todo')).toBe(true);
    expect(matchesFilter('partial', 'partial')).toBe(true);
    expect(matchesFilter('complete', 'todo')).toBe(false);
  });
});

describe('filterCards', () => {
  const delivered: DeliveredMap = { inv: { r1: { satchels: 1 } } }; // r1 partial, r2 todo

  it('filters by query and status together', () => {
    const cards = buildCards(inv, delivered);
    expect(filterCards(cards, { query: 'deer', filter: 'all' }).map((c) => c.rowId)).toEqual(['r2']);
    expect(filterCards(cards, { query: '', filter: 'partial' }).map((c) => c.rowId)).toEqual(['r1']);
    expect(filterCards(cards, { query: '', filter: 'done' })).toEqual([]);
  });
});

describe('filterCounts', () => {
  it('counts all cards and each status bucket', () => {
    const cards: CardItem[] = buildCards(inv, {
      inv: { r1: { satchels: 2, camp: 1 } } // r1 complete, r2 todo
    });
    expect(filterCounts(cards)).toEqual({ all: 2, todo: 1, partial: 0, done: 1 });
  });
});
