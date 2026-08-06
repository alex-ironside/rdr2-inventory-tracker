<script lang="ts">
  import { session } from '../lib/session.svelte';
  import { LocalBackend } from '../lib/storage';
  import { syncLocalToCloud } from '../lib/sync';
  import { formatDateTime } from '../lib/format';
  import { track } from '../lib/analytics';
  import AccountBar from './AccountBar.svelte';
  import type { IterationMeta } from '../lib/types';

  let { onOpen }: { onOpen: (id: string) => void } = $props();

  let items = $state<IterationMeta[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let newTitle = $state('');
  let creating = $state(false);

  // Local → cloud sync (only relevant when signed into Firebase and there are
  // offline playthroughs saved on this device).
  let localCount = $state(0);
  let syncing = $state(false);
  let syncMessage = $state<string | null>(null);

  async function checkLocal() {
    localCount = 0;
    syncMessage = null;
    if (session.mode !== 'firebase') return;
    try {
      const locals = await new LocalBackend().listIterations();
      localCount = locals.length;
    } catch {
      localCount = 0;
    }
  }

  async function runSync() {
    if (syncing || !session.backend) return;
    syncing = true;
    syncMessage = null;
    try {
      const result = await syncLocalToCloud(new LocalBackend(), session.backend);
      syncMessage = `Synced ${result.total} playthrough${result.total === 1 ? '' : 's'} to the cloud (${result.merged} merged, ${result.uploaded} uploaded).`;
      track('sync_run', { total: result.total, merged: result.merged, uploaded: result.uploaded });
      localCount = 0;
      await load();
    } catch (e) {
      syncMessage = `Sync failed: ${(e as Error).message}`;
    } finally {
      syncing = false;
    }
  }

  async function load() {
    loading = true;
    error = null;
    try {
      items = (await session.backend?.listIterations()) ?? [];
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Re-run whenever the backend identity changes (e.g. after sign in).
    if (session.backend) {
      load();
      checkLocal();
    }
  });

  async function create(e: Event) {
    e.preventDefault();
    if (creating || !session.backend) return;
    creating = true;
    try {
      const it = await session.backend.createIteration(newTitle);
      track('iteration_created');
      newTitle = '';
      onOpen(it.id);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      creating = false;
    }
  }

  async function remove(id: string, title: string) {
    if (!session.backend) return;
    if (!confirm(`Delete playthrough "${title}"? This can't be undone.`)) return;
    await session.backend.deleteIteration(id);
    await load();
  }

  const fmt = formatDateTime;
</script>

<div class="page">
  <header class="topbar">
    <div class="title">
      <span class="badge">🤠</span>
      <div>
        <h1>Your Playthroughs</h1>
        <p class="faint sub">RDR2 Crafting Inventory Tracker</p>
      </div>
    </div>
    <div class="account">
      <span class="mode-pill {session.mode}">
        {session.mode === 'firebase' ? '☁ Firebase' : '📴 Offline'}
      </span>
      {#if session.user?.email}
        <span class="faint email">{session.user.email}</span>
      {/if}
      <button class="btn-ghost" onclick={() => session.signOut()}>Sign out</button>
    </div>
  </header>

  <div class="content">
    <AccountBar />

    <form class="create card" onsubmit={create}>
      <input
        class="input"
        bind:value={newTitle}
        placeholder="New playthrough title — e.g. “Honor Arthur run”"
        maxlength="80"
      />
      <button class="btn" type="submit" disabled={creating}>
        {creating ? 'Creating…' : '+ New Playthrough'}
      </button>
    </form>

    {#if session.mode === 'firebase' && (localCount > 0 || syncMessage)}
      <div class="sync card" role="region" aria-label="Offline data sync">
        <div class="sync-text">
          <strong>☁ Sync offline data</strong>
          {#if syncMessage}
            <span class="muted">{syncMessage}</span>
          {:else}
            <span class="muted">
              {localCount} playthrough{localCount === 1 ? '' : 's'} saved offline on this device. Merging
              keeps your highest progress for every material — nothing is overwritten.
            </span>
          {/if}
        </div>
        {#if localCount > 0}
          <button class="btn" onclick={runSync} disabled={syncing}>
            {syncing ? 'Syncing…' : `Sync ${localCount} to cloud`}
          </button>
        {/if}
      </div>
    {/if}

    {#if loading}
      <p class="muted state">Loading playthroughs…</p>
    {:else if error}
      <p class="err state">{error}</p>
    {:else if items.length === 0}
      <div class="empty card">
        <p class="big">No playthroughs yet</p>
        <p class="muted">
          Create your first iteration above. Each one is a fresh tracker seeded from the crafting
          spreadsheet, so you can run a new tally for every save file.
        </p>
      </div>
    {:else}
      <ul class="list">
        {#each items as it (it.id)}
          <li class="row card">
            <button class="open" onclick={() => onOpen(it.id)}>
              <span class="row-title">{it.title}</span>
              <span class="dates faint">
                Created {fmt(it.createdAt)} · Updated {fmt(it.updatedAt)}
              </span>
            </button>
            <button
              class="btn-ghost btn-danger del"
              onclick={() => remove(it.id, it.title)}
              aria-label="Delete playthrough"
              title="Delete"
            >
              ✕
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--line-soft);
    background: linear-gradient(180deg, #241a12, #1c140d);
    flex-wrap: wrap;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .badge {
    font-size: 2rem;
  }
  h1 {
    font-size: 1.35rem;
    color: var(--accent-2);
  }
  .sub {
    font-size: 0.8rem;
    margin: 0.15rem 0 0;
  }
  .account {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    flex-wrap: wrap;
  }
  .email {
    font-size: 0.82rem;
  }
  .mode-pill {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--line);
  }
  .mode-pill.firebase {
    color: var(--accent-2);
    background: #c8843c1a;
  }
  .mode-pill.local {
    color: var(--text-dim);
    background: #ffffff0a;
  }
  .content {
    padding: 1.5rem;
    max-width: 760px;
    width: 100%;
    margin: 0 auto;
    overflow-y: auto;
  }
  .create {
    display: flex;
    gap: 0.7rem;
    padding: 0.9rem;
    margin-bottom: 1.4rem;
  }
  .create .input {
    flex: 1;
  }
  .create .btn {
    white-space: nowrap;
  }
  .sync {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem;
    margin-bottom: 1.4rem;
    border-color: #c8843c55;
    background: #c8843c12;
    flex-wrap: wrap;
  }
  .sync-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.86rem;
    min-width: 0;
  }
  .sync-text .muted {
    max-width: 60ch;
  }
  .sync .btn {
    white-space: nowrap;
  }
  .state {
    text-align: center;
    padding: 2rem;
  }
  .err {
    color: #e88b74;
  }
  .empty {
    padding: 2.5rem 2rem;
    text-align: center;
  }
  .empty .big {
    font-family: var(--font);
    font-size: 1.3rem;
    margin: 0 0 0.6rem;
  }
  .empty .muted {
    max-width: 46ch;
    margin: 0 auto;
    line-height: 1.5;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .row {
    display: flex;
    align-items: stretch;
    overflow: hidden;
  }
  .open {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 1rem 1.1rem;
    transition: background 0.15s ease;
  }
  .open:hover {
    background: var(--bg-elev);
  }
  .row-title {
    font-family: var(--font);
    font-size: 1.1rem;
    color: var(--accent-2);
  }
  .dates {
    font-size: 0.78rem;
  }
  .del {
    border: none;
    border-left: 1px solid var(--line-soft);
    border-radius: 0;
    padding: 0 1.1rem;
    font-size: 1rem;
  }

  @media (max-width: 640px) {
    .topbar {
      padding: 0.85rem 1rem;
    }
    h1 {
      font-size: 1.2rem;
    }
    .content {
      padding: 1rem;
    }
    /* Stack the title field above the button so neither is squeezed. */
    .create {
      flex-direction: column;
      align-items: stretch;
    }
    .sync {
      flex-direction: column;
      align-items: stretch;
    }
    .sync .btn {
      width: 100%;
    }
  }
</style>
