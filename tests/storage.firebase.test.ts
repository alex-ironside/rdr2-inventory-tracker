import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock the Firestore SDK with lightweight, inspectable fakes -------------
// State is defined via vi.hoisted so it is available inside the hoisted mock factory.
const h = vi.hoisted(() => {
  const state: {
    getDocsResult: { docs: Array<{ id: string; data: () => unknown }> };
    getDocResult: { exists: () => boolean; id: string; data: () => unknown };
  } = {
    getDocsResult: { docs: [] },
    getDocResult: { exists: () => false, id: '', data: () => ({}) }
  };
  return {
    state,
    setDoc: vi.fn(async () => undefined),
    updateDoc: vi.fn(async () => undefined),
    deleteDoc: vi.fn(async () => undefined)
  };
});
const { setDoc, updateDoc, deleteDoc, state } = h;

vi.mock('../src/lib/firebase', () => ({ getDb: () => ({ __db: true }) }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ __col: name }),
  doc: (col: unknown, id: string) => ({ __doc: id, col }),
  query: (...args: unknown[]) => ({ __query: args }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, dir: string) => ({ field, dir }),
  serverTimestamp: () => ({ __serverTs: true }),
  getDocs: vi.fn(async () => h.state.getDocsResult),
  getDoc: vi.fn(async () => h.state.getDocResult),
  setDoc: h.setDoc,
  updateDoc: h.updateDoc,
  deleteDoc: h.deleteDoc
}));

import { FirebaseBackend } from '../src/lib/storage';

describe('FirebaseBackend', () => {
  let backend: FirebaseBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = new FirebaseBackend('user-123');
  });

  it('exposes firebase mode', () => {
    expect(backend.mode).toBe('firebase');
  });

  it('lists iterations scoped to the owner, mapping timestamps', async () => {
    state.getDocsResult = {
      docs: [
        {
          id: 'a',
          data: () => ({ title: 'A', createdAt: 1000, updatedAt: { toMillis: () => 2000 } })
        }
      ]
    };
    const list = await backend.listIterations();
    expect(list).toEqual([{ id: 'a', title: 'A', createdAt: 1000, updatedAt: 2000 }]);
  });

  it('defaults a missing title when listing', async () => {
    state.getDocsResult = { docs: [{ id: 'a', data: () => ({}) }] };
    const [first] = await backend.listIterations();
    expect(first.title).toBe('Untitled Playthrough');
  });

  it('returns null when an iteration does not exist', async () => {
    state.getDocResult = { exists: () => false, id: 'x', data: () => ({}) };
    expect(await backend.getIteration('x')).toBeNull();
  });

  it('reads an iteration and supplies defaults for missing fields', async () => {
    state.getDocResult = {
      exists: () => true,
      id: 'x',
      data: () => ({ title: 'X', createdAt: { seconds: 5 } })
    };
    const it = await backend.getIteration('x');
    expect(it).toEqual({
      id: 'x',
      title: 'X',
      createdAt: 5000,
      updatedAt: 0,
      delivered: {},
      freeze: { cols: {}, rows: {} },
      history: []
    });
  });

  it('defaults a missing title when reading a single iteration', async () => {
    state.getDocResult = { exists: () => true, id: 'x', data: () => ({}) };
    const it = await backend.getIteration('x');
    expect(it?.title).toBe('Untitled Playthrough');
  });

  it('reads stored delivered / freeze when present', async () => {
    state.getDocResult = {
      exists: () => true,
      id: 'x',
      data: () => ({
        title: 'X',
        delivered: { s: { r: { c: 2 } } },
        freeze: { cols: { s: ['c'] }, rows: {} }
      })
    };
    const it = await backend.getIteration('x');
    expect(it?.delivered).toEqual({ s: { r: { c: 2 } } });
    expect(it?.freeze).toEqual({ cols: { s: ['c'] }, rows: {} });
  });

  it('creates an iteration with owner + server timestamps', async () => {
    const it = await backend.createIteration('New Run');
    expect(setDoc).toHaveBeenCalledOnce();
    const payload = setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.ownerUid).toBe('user-123');
    expect(payload.title).toBe('New Run');
    expect(payload.createdAt).toEqual({ __serverTs: true });
    expect(it.title).toBe('New Run');
    expect(it.id).toMatch(/^it_/);
  });

  it('updates the title', async () => {
    await backend.updateTitle('id1', '  Renamed  ');
    const payload = updateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.title).toBe('Renamed');
  });

  it('saves progress including history', async () => {
    const delivered = { s: { r: { c: 1 } } };
    const freeze = { cols: {}, rows: {} };
    const history = [{ id: 'h1', at: 9, label: 'Checked column', delivered: {} }];
    await backend.saveProgress('id1', { delivered, freeze, history });
    const payload = updateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(payload.delivered).toEqual(delivered);
    expect(payload.freeze).toEqual(freeze);
    expect(payload.history).toEqual(history);
  });

  it('deletes an iteration', async () => {
    await backend.deleteIteration('id1');
    expect(deleteDoc).toHaveBeenCalledOnce();
  });

  it('upserts a whole iteration under its own id with numeric timestamps', async () => {
    await backend.putIteration({
      id: 'keep-id',
      title: '  Kept  ',
      createdAt: 111,
      updatedAt: 222,
      delivered: { s: { r: { c: 3 } } },
      freeze: { cols: {}, rows: {} },
      history: [{ id: 'h', at: 1, label: 'x', delivered: {} }]
    });
    expect(setDoc).toHaveBeenCalledOnce();
    const [ref, payload] = setDoc.mock.calls[0] as [{ __doc: string }, Record<string, unknown>];
    expect(ref.__doc).toBe('keep-id');
    expect(payload.ownerUid).toBe('user-123');
    expect(payload.title).toBe('Kept');
    expect(payload.createdAt).toBe(111);
    expect(payload.updatedAt).toBe(222);
    expect(payload.delivered).toEqual({ s: { r: { c: 3 } } });
  });

  it('maps a null timestamp to 0', async () => {
    state.getDocsResult = { docs: [{ id: 'a', data: () => ({ title: 'A', updatedAt: null }) }] };
    const [first] = await backend.listIterations();
    expect(first.updatedAt).toBe(0);
  });

  it('maps an unrecognised timestamp shape to 0', async () => {
    state.getDocsResult = {
      docs: [{ id: 'a', data: () => ({ title: 'A', updatedAt: { weird: true } }) }]
    };
    const [first] = await backend.listIterations();
    expect(first.updatedAt).toBe(0);
  });
});
