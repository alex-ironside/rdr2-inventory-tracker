// Local → cloud synchronisation with deterministic, non-destructive conflict
// resolution.
//
// Conflict strategy (documented in CLAUDE.md):
//   Deliveries only ever go up during a playthrough, so for every tracked cell
//   we keep the HIGHER delivered count from the two sides — no progress is ever
//   lost. For scalar metadata that can genuinely diverge (title, freeze layout)
//   the more recently edited copy (greater updatedAt) wins. createdAt keeps the
//   earliest; updatedAt keeps the latest. This is commutative and idempotent:
//   syncing twice yields the same result.

import type { DeliveredMap, HistoryEntry, Iteration } from './types';
import type { StorageBackend } from './storage';
import { MAX_HISTORY } from './history';

/** Merge two delivered maps taking the maximum delivered amount per cell. */
export function mergeDelivered(a: DeliveredMap, b: DeliveredMap): DeliveredMap {
  const out: DeliveredMap = {};
  for (const sheetId of unionKeys(a, b)) {
    const sa = a[sheetId] ?? {};
    const sb = b[sheetId] ?? {};
    const sheet: Record<string, Record<string, number>> = {};
    for (const rowId of unionKeys(sa, sb)) {
      const ra = sa[rowId] ?? {};
      const rb = sb[rowId] ?? {};
      const row: Record<string, number> = {};
      for (const colKey of unionKeys(ra, rb)) {
        row[colKey] = Math.max(ra[colKey] ?? 0, rb[colKey] ?? 0);
      }
      if (Object.keys(row).length) sheet[rowId] = row;
    }
    if (Object.keys(sheet).length) out[sheetId] = sheet;
  }
  return out;
}

function unionKeys(a: object, b: object): string[] {
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
}

/** Merge two history logs: union by entry id, ordered by time, capped. */
export function mergeHistory(a: HistoryEntry[], b: HistoryEntry[]): HistoryEntry[] {
  const byId = new Map<string, HistoryEntry>();
  for (const e of [...a, ...b]) byId.set(e.id, e);
  return Array.from(byId.values())
    .sort((x, y) => x.at - y.at)
    .slice(-MAX_HISTORY);
}

/** Merge a local and a remote iteration (same id) into a single record. */
export function mergeIterations(local: Iteration, remote: Iteration): Iteration {
  const localNewer = local.updatedAt >= remote.updatedAt;
  const newer = localNewer ? local : remote;
  return {
    id: local.id,
    title: newer.title,
    freeze: newer.freeze,
    createdAt: Math.min(local.createdAt, remote.createdAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    delivered: mergeDelivered(local.delivered, remote.delivered),
    history: mergeHistory(local.history, remote.history)
  };
}

export interface SyncResult {
  /** Local iterations that had no cloud counterpart and were uploaded as-is. */
  uploaded: number;
  /** Local iterations that were merged into an existing cloud iteration. */
  merged: number;
  total: number;
}

/**
 * Push every local iteration to the cloud, merging where a cloud copy already
 * exists. Local storage is left untouched (non-destructive).
 */
export async function syncLocalToCloud(
  local: StorageBackend,
  cloud: StorageBackend
): Promise<SyncResult> {
  const metas = await local.listIterations();
  let uploaded = 0;
  let merged = 0;

  for (const meta of metas) {
    const localIt = await local.getIteration(meta.id);
    if (!localIt) continue;
    const remoteIt = await cloud.getIteration(meta.id);
    if (remoteIt) {
      await cloud.putIteration(mergeIterations(localIt, remoteIt));
      merged++;
    } else {
      await cloud.putIteration(localIt);
      uploaded++;
    }
  }

  return { uploaded, merged, total: uploaded + merged };
}
