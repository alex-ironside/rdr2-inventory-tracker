// Storage abstraction. Two interchangeable backends implement the same
// interface so the UI never cares where data lives:
//   - LocalBackend:    browser localStorage, no account needed ("offline mode").
//   - FirebaseBackend: Cloud Firestore, scoped to the signed-in user.

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { getDb } from './firebase';
import { generateId } from './ids';
import { emptyFreeze } from './freeze';
import { DEFAULT_TITLE, normalizeTitle } from './title';
import type { DeliveredMap, FreezeState, HistoryEntry, Iteration, IterationMeta } from './types';

/** The mutable per-iteration state persisted on each save. */
export interface ProgressPatch {
  delivered: DeliveredMap;
  freeze: FreezeState;
  history: HistoryEntry[];
}

export interface StorageBackend {
  readonly mode: 'firebase' | 'local';
  listIterations(): Promise<IterationMeta[]>;
  getIteration(id: string): Promise<Iteration | null>;
  createIteration(title: string): Promise<Iteration>;
  updateTitle(id: string, title: string): Promise<void>;
  saveProgress(id: string, patch: ProgressPatch): Promise<void>;
  deleteIteration(id: string): Promise<void>;
  /** Upsert a whole iteration under its own id (used by local→cloud sync). */
  putIteration(it: Iteration): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local backend (localStorage)
// ---------------------------------------------------------------------------

const LS_KEY = 'rdr2-tracker:iterations';

export class LocalBackend implements StorageBackend {
  readonly mode = 'local' as const;

  private readAll(): Record<string, Iteration> {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, Iteration>) : {};
    } catch {
      return {};
    }
  }

  private writeAll(all: Record<string, Iteration>): void {
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  }

  async listIterations(): Promise<IterationMeta[]> {
    const all = this.readAll();
    return Object.values(all)
      .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getIteration(id: string): Promise<Iteration | null> {
    const it = this.readAll()[id];
    if (!it) return null;
    if (!it.freeze) it.freeze = emptyFreeze();
    if (!it.delivered) it.delivered = {};
    if (!it.history) it.history = [];
    return it;
  }

  async createIteration(title: string): Promise<Iteration> {
    const now = Date.now();
    const it: Iteration = {
      id: generateId(),
      title: normalizeTitle(title),
      createdAt: now,
      updatedAt: now,
      delivered: {},
      freeze: emptyFreeze(),
      history: []
    };
    const all = this.readAll();
    all[it.id] = it;
    this.writeAll(all);
    return it;
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const all = this.readAll();
    if (!all[id]) return;
    all[id].title = normalizeTitle(title);
    all[id].updatedAt = Date.now();
    this.writeAll(all);
  }

  async saveProgress(id: string, patch: ProgressPatch): Promise<void> {
    const all = this.readAll();
    if (!all[id]) return;
    all[id].delivered = patch.delivered;
    all[id].freeze = patch.freeze;
    all[id].history = patch.history;
    all[id].updatedAt = Date.now();
    this.writeAll(all);
  }

  async deleteIteration(id: string): Promise<void> {
    const all = this.readAll();
    delete all[id];
    this.writeAll(all);
  }

  async putIteration(it: Iteration): Promise<void> {
    const all = this.readAll();
    all[it.id] = it;
    this.writeAll(all);
  }
}

// ---------------------------------------------------------------------------
// Firebase backend (Firestore)
// ---------------------------------------------------------------------------

export class FirebaseBackend implements StorageBackend {
  readonly mode = 'firebase' as const;

  constructor(private readonly uid: string) {}

  private col() {
    return collection(getDb(), 'iterations');
  }

  async listIterations(): Promise<IterationMeta[]> {
    const q = query(this.col(), where('ownerUid', '==', this.uid), orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title ?? DEFAULT_TITLE,
        createdAt: toMillis(data.createdAt),
        updatedAt: toMillis(data.updatedAt)
      };
    });
  }

  async getIteration(id: string): Promise<Iteration | null> {
    const snap = await getDoc(doc(this.col(), id));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      title: data.title ?? DEFAULT_TITLE,
      createdAt: toMillis(data.createdAt),
      updatedAt: toMillis(data.updatedAt),
      delivered: (data.delivered as DeliveredMap) ?? {},
      freeze: (data.freeze as FreezeState) ?? emptyFreeze(),
      history: (data.history as HistoryEntry[]) ?? []
    };
  }

  async createIteration(title: string): Promise<Iteration> {
    const id = generateId();
    const now = Date.now();
    const clean = normalizeTitle(title);
    await setDoc(doc(this.col(), id), {
      ownerUid: this.uid,
      title: clean,
      delivered: {},
      freeze: emptyFreeze(),
      history: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return {
      id,
      title: clean,
      createdAt: now,
      updatedAt: now,
      delivered: {},
      freeze: emptyFreeze(),
      history: []
    };
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await updateDoc(doc(this.col(), id), {
      title: normalizeTitle(title),
      updatedAt: serverTimestamp()
    });
  }

  async saveProgress(id: string, patch: ProgressPatch): Promise<void> {
    await updateDoc(doc(this.col(), id), {
      delivered: patch.delivered,
      freeze: patch.freeze,
      history: patch.history,
      updatedAt: serverTimestamp()
    });
  }

  async deleteIteration(id: string): Promise<void> {
    await deleteDoc(doc(this.col(), id));
  }

  async putIteration(it: Iteration): Promise<void> {
    // Upsert under the iteration's own id so a local record and its cloud
    // counterpart stay the same document. Numeric timestamps are preserved so
    // merge/conflict resolution stays deterministic.
    await setDoc(doc(this.col(), it.id), {
      ownerUid: this.uid,
      title: normalizeTitle(it.title),
      delivered: it.delivered,
      freeze: it.freeze,
      history: it.history,
      createdAt: it.createdAt,
      updatedAt: it.updatedAt
    });
  }
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  // Firestore Timestamp
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}
