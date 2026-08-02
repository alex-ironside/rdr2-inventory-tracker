import { describe, it, expect, beforeEach } from 'vitest';
import { LocalBackend } from '../src/lib/storage';
import { DEFAULT_TITLE } from '../src/lib/title';

const LS_KEY = 'rdr2-tracker:iterations';

describe('LocalBackend', () => {
  let backend: LocalBackend;

  beforeEach(() => {
    localStorage.clear();
    backend = new LocalBackend();
  });

  it('exposes local mode', () => {
    expect(backend.mode).toBe('local');
  });

  it('creates and retrieves an iteration', async () => {
    const it = await backend.createIteration('My Run');
    expect(it.title).toBe('My Run');
    expect(it.delivered).toEqual({});
    expect(it.freeze).toEqual({ cols: {}, rows: {} });
    const fetched = await backend.getIteration(it.id);
    expect(fetched?.id).toBe(it.id);
  });

  it('normalises a blank title on create', async () => {
    const it = await backend.createIteration('   ');
    expect(it.title).toBe(DEFAULT_TITLE);
  });

  it('returns null for a missing iteration', async () => {
    expect(await backend.getIteration('nope')).toBeNull();
  });

  it('lists iterations sorted by updatedAt desc', async () => {
    const a = await backend.createIteration('A');
    const b = await backend.createIteration('B');
    // Make A the most recently updated.
    await backend.saveProgress(a.id, {
      delivered: { s: { r: { c: 1 } } },
      freeze: { cols: {}, rows: {} },
      history: []
    });
    const list = await backend.listIterations();
    expect(list.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(list[0]).not.toHaveProperty('delivered'); // meta only
  });

  it('updates the title', async () => {
    const it = await backend.createIteration('Old');
    await backend.updateTitle(it.id, 'New');
    expect((await backend.getIteration(it.id))?.title).toBe('New');
  });

  it('ignores updateTitle for a missing id', async () => {
    await expect(backend.updateTitle('ghost', 'x')).resolves.toBeUndefined();
  });

  it('persists delivered + freeze + history via saveProgress', async () => {
    const it = await backend.createIteration('Run');
    const delivered = { sheet: { row: { col: 3 } } };
    const freeze = { cols: { sheet: ['col'] }, rows: {} };
    const history = [{ id: 'h1', at: 5, label: 'Checked row', delivered: {} }];
    await backend.saveProgress(it.id, { delivered, freeze, history });
    const fetched = await backend.getIteration(it.id);
    expect(fetched?.delivered).toEqual(delivered);
    expect(fetched?.freeze).toEqual(freeze);
    expect(fetched?.history).toEqual(history);
  });

  it('ignores saveProgress for a missing id', async () => {
    await expect(
      backend.saveProgress('ghost', { delivered: {}, freeze: { cols: {}, rows: {} }, history: [] })
    ).resolves.toBeUndefined();
  });

  it('deletes an iteration', async () => {
    const it = await backend.createIteration('Doomed');
    await backend.deleteIteration(it.id);
    expect(await backend.getIteration(it.id)).toBeNull();
  });

  it('upserts a whole iteration via putIteration', async () => {
    const it = {
      id: 'put1',
      title: 'Put',
      createdAt: 1,
      updatedAt: 2,
      delivered: { s: { r: { c: 4 } } },
      freeze: { cols: {}, rows: {} },
      history: []
    };
    await backend.putIteration(it);
    expect(await backend.getIteration('put1')).toEqual(it);
  });

  it('recovers from corrupt storage by treating it as empty', async () => {
    localStorage.setItem(LS_KEY, '{ not valid json');
    expect(await backend.listIterations()).toEqual([]);
  });

  it('backfills missing freeze / delivered / history on legacy records', async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ legacy: { id: 'legacy', title: 'Legacy', createdAt: 1, updatedAt: 1 } })
    );
    const fetched = await backend.getIteration('legacy');
    expect(fetched?.freeze).toEqual({ cols: {}, rows: {} });
    expect(fetched?.delivered).toEqual({});
    expect(fetched?.history).toEqual([]);
  });
});
