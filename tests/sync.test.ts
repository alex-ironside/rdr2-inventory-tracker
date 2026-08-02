import { describe, it, expect, beforeEach } from 'vitest';
import { mergeDelivered, mergeHistory, mergeIterations, syncLocalToCloud } from '../src/lib/sync';
import { LocalBackend } from '../src/lib/storage';
import type { HistoryEntry, Iteration } from '../src/lib/types';

describe('mergeDelivered', () => {
  it('takes the maximum per cell across both maps', () => {
    const a = { s: { r: { c1: 3, c2: 1 } } };
    const b = { s: { r: { c1: 2, c3: 5 }, r2: { c: 4 } } };
    expect(mergeDelivered(a, b)).toEqual({
      s: { r: { c1: 3, c2: 1, c3: 5 }, r2: { c: 4 } }
    });
  });

  it('is commutative', () => {
    const a = { s: { r: { c: 3 } } };
    const b = { s: { r: { c: 7 } } };
    expect(mergeDelivered(a, b)).toEqual(mergeDelivered(b, a));
  });

  it('handles empty inputs', () => {
    expect(mergeDelivered({}, {})).toEqual({});
  });

  it('unions disjoint sheets and rows from each side', () => {
    expect(mergeDelivered({ a: { r: { c: 1 } } }, { b: { r2: { c: 2 } } })).toEqual({
      a: { r: { c: 1 } },
      b: { r2: { c: 2 } }
    });
  });

  it('drops empty rows/sheets that contribute nothing', () => {
    expect(mergeDelivered({ s: {} }, {})).toEqual({});
  });
});

describe('mergeHistory', () => {
  const h = (id: string, at: number): HistoryEntry => ({ id, at, label: id, delivered: {} });

  it('unions by id, sorted by time', () => {
    const a = [h('a', 1), h('b', 3)];
    const b = [h('b', 3), h('c', 2)];
    expect(mergeHistory(a, b).map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op for two empty logs', () => {
    expect(mergeHistory([], [])).toEqual([]);
  });
});

function iter(over: Partial<Iteration>): Iteration {
  return {
    id: 'i1',
    title: 'T',
    createdAt: 100,
    updatedAt: 100,
    delivered: {},
    freeze: { cols: {}, rows: {} },
    history: [],
    ...over
  };
}

describe('mergeIterations', () => {
  it('keeps the newer title and freeze, earliest createdAt, latest updatedAt', () => {
    const local = iter({
      title: 'Local',
      createdAt: 50,
      updatedAt: 200,
      freeze: { cols: { s: ['a'] }, rows: {} }
    });
    const remote = iter({ title: 'Remote', createdAt: 30, updatedAt: 150 });
    const m = mergeIterations(local, remote);
    expect(m.title).toBe('Local'); // local is newer
    expect(m.freeze).toEqual({ cols: { s: ['a'] }, rows: {} });
    expect(m.createdAt).toBe(30);
    expect(m.updatedAt).toBe(200);
  });

  it('lets the remote win title when it is newer', () => {
    const local = iter({ title: 'Local', updatedAt: 100 });
    const remote = iter({ title: 'Remote', updatedAt: 300 });
    expect(mergeIterations(local, remote).title).toBe('Remote');
  });

  it('unions delivered progress non-destructively', () => {
    const local = iter({ delivered: { s: { r: { c: 2 } } } });
    const remote = iter({ delivered: { s: { r: { c: 5 }, r2: { c: 1 } } } });
    expect(mergeIterations(local, remote).delivered).toEqual({
      s: { r: { c: 5 }, r2: { c: 1 } }
    });
  });

  it('is idempotent when merged twice', () => {
    const local = iter({ title: 'A', updatedAt: 200, delivered: { s: { r: { c: 2 } } } });
    const remote = iter({ title: 'B', updatedAt: 100, delivered: { s: { r: { c: 5 } } } });
    const once = mergeIterations(local, remote);
    const twice = mergeIterations(once, remote);
    expect(twice).toEqual(once);
  });
});

describe('syncLocalToCloud', () => {
  let local: LocalBackend;
  let cloud: LocalBackend;

  beforeEach(() => {
    localStorage.clear();
    local = new LocalBackend();
    // A second LocalBackend shares localStorage, so simulate the cloud with an
    // isolated in-memory map via a separate key space.
    cloud = new (class extends LocalBackend {
      private store: Record<string, Iteration> = {};
      async listIterations() {
        return Object.values(this.store)
          .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
          .sort((a, b) => b.updatedAt - a.updatedAt);
      }
      async getIteration(id: string) {
        return this.store[id] ?? null;
      }
      async putIteration(it: Iteration) {
        this.store[it.id] = it;
      }
    })();
  });

  it('uploads local iterations that do not exist in the cloud', async () => {
    const it = await local.createIteration('Fresh');
    await local.saveProgress(it.id, {
      delivered: { s: { r: { c: 3 } } },
      freeze: { cols: {}, rows: {} },
      history: []
    });
    const result = await syncLocalToCloud(local, cloud);
    expect(result).toEqual({ uploaded: 1, merged: 0, total: 1 });
    const remote = await cloud.getIteration(it.id);
    expect(remote?.delivered).toEqual({ s: { r: { c: 3 } } });
  });

  it('merges when a cloud copy already exists', async () => {
    const it = await local.createIteration('Run');
    await local.saveProgress(it.id, {
      delivered: { s: { r: { c: 2 } } },
      freeze: { cols: {}, rows: {} },
      history: []
    });
    // Seed the cloud with a higher count on a different cell.
    await cloud.putIteration({
      ...it,
      updatedAt: it.updatedAt + 10,
      delivered: { s: { r: { c: 1 }, r2: { c: 9 } } }
    });
    const result = await syncLocalToCloud(local, cloud);
    expect(result).toEqual({ uploaded: 0, merged: 1, total: 1 });
    const remote = await cloud.getIteration(it.id);
    expect(remote?.delivered).toEqual({ s: { r: { c: 2 }, r2: { c: 9 } } });
  });

  it('skips iterations that vanish between listing and reading', async () => {
    const flaky = new (class extends LocalBackend {
      async listIterations() {
        return [{ id: 'ghost', title: 'x', createdAt: 1, updatedAt: 1 }];
      }
      async getIteration() {
        return null;
      }
    })();
    const result = await syncLocalToCloud(flaky, cloud);
    expect(result).toEqual({ uploaded: 0, merged: 0, total: 0 });
  });
});
