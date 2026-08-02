<script lang="ts">
  import { formatShort } from '../lib/format';
  import type { HistoryEntry } from '../lib/types';

  let {
    entries,
    scopeLabel,
    onRestore,
    onClose
  }: {
    entries: HistoryEntry[];
    scopeLabel: string | null;
    onRestore: (entry: HistoryEntry) => void;
    onClose: () => void;
  } = $props();

  // Newest first.
  const ordered = $derived([...entries].slice().reverse());

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="backdrop">
  <!-- Dismiss via the Close button or the Escape key (handled on window). -->
  <div class="panel card" role="dialog" aria-modal="true" aria-label="Change history" tabindex="-1">
    <header class="head">
      <h2>{scopeLabel ? `Reset ${scopeLabel}` : 'Change history'}</h2>
      <button class="btn-ghost close" onclick={onClose} aria-label="Close history">✕</button>
    </header>

    <p class="hint muted">
      {#if scopeLabel}
        Choose a point in time to restore <strong>{scopeLabel}</strong> to. Restoring is itself recorded,
        so you can undo it.
      {:else}
        Restore your whole tally to an earlier point. Restoring is itself recorded, so you can undo
        it.
      {/if}
    </p>

    {#if ordered.length === 0}
      <p class="empty muted">
        No history yet. Bulk actions like “check all” and restores are recorded here so you can undo
        them.
      </p>
    {:else}
      <ul class="list">
        {#each ordered as entry (entry.id)}
          <li class="row">
            <div class="meta">
              <span class="label">{entry.label}</span>
              <span class="time faint">{formatShort(entry.at)}</span>
            </div>
            <button class="btn restore" onclick={() => onRestore(entry)}>Restore</button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    z-index: 100;
  }
  .panel {
    width: 100%;
    max-width: 460px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    padding: 1.2rem 1.3rem 1rem;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  h2 {
    font-size: 1.2rem;
    color: var(--accent-2);
  }
  .close {
    padding: 0.3rem 0.6rem;
  }
  .hint {
    font-size: 0.84rem;
    margin: 0 0 0.9rem;
    line-height: 1.45;
  }
  .empty {
    text-align: center;
    padding: 1.5rem 0.5rem;
    line-height: 1.5;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--line-soft);
    border-radius: 8px;
    background: #17110bcc;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .label {
    font-weight: 600;
  }
  .time {
    font-size: 0.78rem;
  }
  .restore {
    padding: 0.4rem 0.85rem;
    white-space: nowrap;
  }
</style>
