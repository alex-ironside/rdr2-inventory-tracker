<script lang="ts">
  import { session } from '../lib/session.svelte';
  import { SHEETS } from '../lib/seed';
  import { sheetProgress } from '../lib/compute';
  import { formatShort } from '../lib/format';
  import { checkScope, restoreScope, scopeLabel, pushHistory, type Scope } from '../lib/history';
  import { generateId } from '../lib/ids';
  import type { DeliveredMap, FreezeState, HistoryEntry, Iteration, Sheet } from '../lib/types';
  import SheetGrid from './SheetGrid.svelte';
  import HistoryPanel from './HistoryPanel.svelte';

  let { iterationId, onBack }: { iterationId: string; onBack: () => void } = $props();

  let iteration = $state<Iteration | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let activeSheet = $state(SHEETS[0].id);
  let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
  let editingTitle = $state(false);
  let titleDraft = $state('');

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function load() {
    loading = true;
    error = null;
    try {
      const it = await session.backend?.getIteration(iterationId);
      if (!it) {
        error = 'Playthrough not found.';
      } else {
        iteration = it;
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    load();
  });

  function scheduleSave() {
    saveState = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 700);
  }

  async function flush() {
    // Only ever scheduled after the iteration has loaded within an authenticated
    // session, so iteration and backend are guaranteed present here.
    const it = iteration!;
    try {
      await session.backend!.saveProgress(it.id, {
        delivered: it.delivered,
        freeze: it.freeze,
        history: it.history
      });
      it.updatedAt = Date.now();
      saveState = 'saved';
    } catch (e) {
      saveState = 'error';
      error = (e as Error).message;
    }
  }

  // Record a snapshot of the CURRENT delivered state before a bulk/restore
  // action, so the user can always roll back to just before it happened.
  function recordCheckpoint(label: string) {
    const it = iteration!;
    const entry: HistoryEntry = {
      id: generateId('h'),
      at: Date.now(),
      label,
      delivered: it.delivered
    };
    it.history = pushHistory(it.history, entry);
  }

  // --- bulk check (set collected = required) ---
  let historyOpen = $state(false);
  let resetScope = $state<Scope | null>(null);

  function requestCheck(sheet: Sheet, scope: Scope) {
    const label = scopeLabel(sheet, scope);
    if (!confirm(`Set all collected amounts in ${label} equal to their required amounts?`)) return;
    recordCheckpoint(`Checked ${label}`);
    iteration!.delivered = checkScope(iteration!.delivered, sheet, scope);
    scheduleSave();
  }

  // --- restore from history ---
  function openHistory() {
    resetScope = null;
    historyOpen = true;
  }
  function requestReset(scope: Scope) {
    resetScope = scope;
    historyOpen = true;
  }

  function restoreEntry(entry: HistoryEntry) {
    const it = iteration!;
    const sheet = active;
    const scope = resetScope;
    const target = scope ? scopeLabel(sheet, scope) : 'everything';
    if (!confirm(`Restore ${target} to the state from ${fmt(entry.at)}?`)) return;
    recordCheckpoint(scope ? `Reset ${scopeLabel(sheet, scope)}` : 'Restored all');
    it.delivered = scope
      ? restoreScope(it.delivered, entry.delivered, sheet, scope)
      : entry.delivered;
    historyOpen = false;
    resetScope = null;
    scheduleSave();
  }

  // Flush any pending save when leaving.
  $effect(() => {
    return () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        flush();
      }
    };
  });

  // The grid and title controls only render inside `{#if iteration}`, so these
  // handlers always have a loaded iteration.
  function onDeliveredChange(next: DeliveredMap) {
    iteration!.delivered = next;
    scheduleSave();
  }

  function onFreezeChange(next: FreezeState) {
    iteration!.freeze = next;
    scheduleSave();
  }

  function startEditTitle() {
    titleDraft = iteration!.title;
    editingTitle = true;
  }

  async function commitTitle() {
    editingTitle = false;
    const it = iteration!;
    const clean = titleDraft.trim() || it.title;
    if (clean === it.title) return;
    it.title = clean;
    try {
      await session.backend!.updateTitle(it.id, clean);
      it.updatedAt = Date.now();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const active = $derived(SHEETS.find((s) => s.id === activeSheet)!);

  function progressFor(id: string) {
    const s = SHEETS.find((x) => x.id === id)!;
    return sheetProgress(s, iteration!.delivered);
  }

  const fmt = formatShort;
</script>

<div class="view">
  <header class="topbar">
    <div class="left">
      <button class="btn-ghost back" onclick={onBack} title="Back to playthroughs">←</button>
      {#if iteration}
        {#if editingTitle}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            class="input title-edit"
            bind:value={titleDraft}
            onblur={commitTitle}
            onkeydown={(e) => e.key === 'Enter' && commitTitle()}
            maxlength="80"
            autofocus
          />
        {:else}
          <button class="title-btn" onclick={startEditTitle} title="Rename">
            <span class="ttl">{iteration.title}</span>
            <span class="pencil">✎</span>
          </button>
        {/if}
      {/if}
    </div>
    <div class="right">
      <span class="save-pill {saveState}">
        {#if saveState === 'saving'}Saving…
        {:else if saveState === 'saved'}✓ Saved
        {:else if saveState === 'error'}⚠ Save failed
        {:else}&nbsp;{/if}
      </span>
      {#if iteration}
        <button class="btn-ghost history-btn" onclick={openHistory} title="Change history">
          🕘 History{iteration.history.length ? ` (${iteration.history.length})` : ''}
        </button>
        <span class="faint dates">Updated {fmt(iteration.updatedAt)}</span>
      {/if}
      <span class="mode-pill {session.mode}">
        {session.mode === 'firebase' ? '☁' : '📴'}
      </span>
    </div>
  </header>

  {#if loading}
    <p class="state muted">Loading tracker…</p>
  {:else if error && !iteration}
    <p class="state err">{error}</p>
  {:else if iteration}
    {#if error}
      <p class="inline-err" role="alert">{error}</p>
    {/if}
    <nav class="tabs">
      {#each SHEETS as s (s.id)}
        {@const p = progressFor(s.id)}
        <button
          class="tab"
          class:active={s.id === activeSheet}
          class:done={p.have >= p.needed}
          onclick={() => (activeSheet = s.id)}
        >
          <span class="tab-label">{s.title}</span>
          <span class="tab-badge">{p.percent}%</span>
        </button>
      {/each}
    </nav>

    <SheetGrid
      sheet={active}
      delivered={iteration.delivered}
      freeze={iteration.freeze}
      onDelivered={onDeliveredChange}
      onFreeze={onFreezeChange}
      onCheck={(scope) => requestCheck(active, scope)}
      onReset={requestReset}
    />
  {/if}

  {#if historyOpen && iteration}
    <HistoryPanel
      entries={iteration.history}
      scopeLabel={resetScope ? scopeLabel(active, resetScope) : null}
      onRestore={restoreEntry}
      onClose={() => (historyOpen = false)}
    />
  {/if}
</div>

<style>
  .view {
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
    padding: 0.6rem 1rem;
    border-bottom: 1px solid var(--line-soft);
    background: linear-gradient(180deg, #241a12, #1c140d);
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }
  .back {
    font-size: 1.1rem;
    padding: 0.3rem 0.7rem;
  }
  .title-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: transparent;
    border: none;
    color: var(--accent-2);
    font-family: var(--font);
    font-size: 1.2rem;
    padding: 0.2rem 0.3rem;
    min-width: 0;
  }
  .ttl {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 46vw;
  }
  .pencil {
    font-size: 0.85rem;
    color: var(--text-faint);
  }
  .title-btn:hover .pencil {
    color: var(--accent);
  }
  .title-edit {
    font-family: var(--font);
    font-size: 1.1rem;
    width: min(46vw, 400px);
  }
  .dates {
    font-size: 0.78rem;
  }
  .save-pill {
    font-size: 0.78rem;
    min-width: 5.5rem;
    text-align: right;
    color: var(--text-faint);
  }
  .save-pill.saved {
    color: var(--green-bright);
  }
  .save-pill.error {
    color: #e88b74;
  }
  .mode-pill {
    font-size: 0.85rem;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.15rem 0.5rem;
  }
  .state {
    text-align: center;
    padding: 3rem;
  }
  .err {
    color: #e88b74;
  }
  .inline-err {
    margin: 0;
    padding: 0.5rem 1rem;
    background: #b5462f22;
    border-bottom: 1px solid #b5462f55;
    color: #e88b74;
    font-size: 0.85rem;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem 0;
    overflow-x: auto;
    border-bottom: 1px solid var(--line-soft);
    background: #1b140d;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    background: transparent;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    color: var(--text-dim);
    padding: 0.5rem 0.85rem;
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }
  .tab:hover {
    color: var(--text);
    background: #ffffff08;
  }
  .tab.active {
    background: var(--bg-panel);
    border-color: var(--line-soft);
    color: var(--accent-2);
  }
  .tab-badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    background: #ffffff12;
    color: var(--text-dim);
  }
  .tab.done .tab-badge {
    background: var(--green);
    color: #12180a;
  }
  .tab.active .tab-badge {
    color: var(--text);
  }
</style>
