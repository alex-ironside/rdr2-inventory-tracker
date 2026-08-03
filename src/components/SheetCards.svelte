<script lang="ts">
  // Mobile card-list view for one sheet: search, status filter chips, and a
  // tap-to-expand card per trackable row. Replaces the wide grid on phones so
  // there is no horizontal scrolling. Business logic lives in cardlist.ts.
  import type { DeliveredMap, Sheet } from '../lib/types';
  import {
    buildCards,
    filterCards,
    filterCounts,
    type CardFilter,
    type CardItem
  } from '../lib/cardlist';
  import SheetCard from './SheetCard.svelte';

  let {
    sheet,
    delivered,
    onDeliver,
    onCheck,
    onReset
  }: {
    sheet: Sheet;
    delivered: DeliveredMap;
    onDeliver: (rowId: string, colKey: string, value: number) => void;
    onCheck: (rowId: string) => void;
    onReset: (rowId: string) => void;
  } = $props();

  const FILTERS: { id: CardFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'todo', label: 'To collect' },
    { id: 'partial', label: 'In progress' },
    { id: 'done', label: 'Done' }
  ];

  let query = $state('');
  let filter = $state<CardFilter>('all');
  let openRows = $state<Record<string, boolean>>({});

  const cards = $derived(buildCards(sheet, delivered));
  const counts = $derived(filterCounts(cards));
  const shown = $derived(filterCards(cards, { query, filter }));

  // Flatten to section headers + cards so the list groups like the grid does.
  const grouped = $derived.by(() => {
    const out: ({ kind: 'section'; label: string } | { kind: 'card'; card: CardItem })[] = [];
    let last: string | null = null;
    for (const card of shown) {
      if (card.section && card.section !== last) {
        last = card.section;
        out.push({ kind: 'section', label: card.section });
      }
      out.push({ kind: 'card', card });
    }
    return out;
  });

  function toggle(rowId: string) {
    openRows[rowId] = !openRows[rowId];
  }
  function clearSearch() {
    query = '';
  }
</script>

<div class="cards">
  <div class="tools">
    <div class="search">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        class="search-input"
        placeholder="Search {sheet.title.toLowerCase()}…"
        aria-label="Search {sheet.title}"
        autocomplete="off"
        spellcheck="false"
        bind:value={query}
      />
      {#if query}
        <button type="button" class="clear" aria-label="Clear search" onclick={clearSearch}
          >×</button
        >
      {/if}
    </div>
    <div class="chips" role="group" aria-label="Filter by status">
      {#each FILTERS as f (f.id)}
        <button
          type="button"
          class="chip"
          aria-pressed={filter === f.id}
          onclick={() => (filter = f.id)}
        >
          {f.label} <span class="n">{counts[f.id]}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if shown.length === 0}
    <p class="empty">Nothing matches. Try a different search or filter.</p>
  {:else}
    <div class="list">
      {#each grouped as node (node.kind === 'section' ? `s:${node.label}` : `c:${node.card.rowId}`)}
        {#if node.kind === 'section'}
          <h3 class="section">{node.label}</h3>
        {:else}
          <SheetCard
            item={node.card}
            open={!!openRows[node.card.rowId]}
            onToggle={() => toggle(node.card.rowId)}
            onDeliver={(colKey, value) => onDeliver(node.card.rowId, colKey, value)}
            onCheck={() => onCheck(node.card.rowId)}
            onReset={() => onReset(node.card.rowId)}
          />
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  .tools {
    padding: 0.6rem 0.75rem 0.5rem;
    border-bottom: 1px solid var(--line-soft);
    background: var(--bg);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #17110bcc;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 0.7rem;
  }
  .search svg {
    flex-shrink: 0;
    color: var(--text-faint);
  }
  .search-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 0.6rem 0;
    font-size: 16px; /* 16px avoids iOS focus-zoom */
    outline: none;
  }
  .search-input::placeholder {
    color: var(--text-faint);
  }
  .clear {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 1.3rem;
    line-height: 1;
    padding: 0 0.2rem;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }
  .chip {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--text-dim);
    border-radius: 999px;
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .chip .n {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
    font-size: 0.72rem;
  }
  .chip[aria-pressed='true'] {
    background: var(--bg-elev);
    border-color: var(--accent);
    color: var(--text);
  }
  .list {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.6rem 0.75rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .section {
    font-size: 0.68rem;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin: 0.6rem 0.2rem 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .section::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line-soft);
  }
  .empty {
    text-align: center;
    color: var(--text-dim);
    padding: 2.5rem 1.5rem;
  }
  @media (pointer: coarse) {
    .chip {
      padding: 0.5rem 0.85rem;
    }
  }
</style>
