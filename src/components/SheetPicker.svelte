<script lang="ts">
  // Mobile sheet switcher: a bottom-sheet list of every sheet with its progress,
  // replacing the horizontally-scrolling tab strip on narrow screens.
  import type { Sheet } from '../lib/types';
  import type { SheetProgress } from '../lib/compute';

  let {
    sheets,
    activeId,
    progressFor,
    onSelect,
    onClose
  }: {
    sheets: Sheet[];
    activeId: string;
    progressFor: (id: string) => SheetProgress;
    onSelect: (id: string) => void;
    onClose: () => void;
  } = $props();
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && onClose()} />

<!-- Backdrop: clicking outside the panel dismisses it. -->
<button class="scrim" aria-label="Close sheet switcher" onclick={onClose}></button>

<div class="picker" role="dialog" aria-modal="true" aria-label="Jump to a sheet">
  <div class="grabber" aria-hidden="true"></div>
  <h2 class="picker-title">Jump to a sheet</h2>
  <ul class="rows">
    {#each sheets as s (s.id)}
      {@const p = progressFor(s.id)}
      <li>
        <button
          class="prow"
          class:current={s.id === activeId}
          aria-current={s.id === activeId}
          onclick={() => onSelect(s.id)}
        >
          <span class="ring" style="--p:{p.percent}%"><b>{p.percent}</b></span>
          <span class="body">
            <span class="name">{s.title}</span>
            <span class="meta">{p.rowsComplete}/{p.rowsTotal} done · {p.percent}% collected</span>
          </span>
          <span class="go" aria-hidden="true">›</span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    border: none;
    background: rgba(0, 0, 0, 0.55);
    z-index: 40;
    animation: fade 0.18s ease;
  }
  .picker {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    background: var(--bg-panel);
    border-top: 1px solid var(--line);
    border-radius: 18px 18px 0 0;
    box-shadow: var(--shadow);
    padding: 0.5rem 0.85rem calc(1.1rem + env(safe-area-inset-bottom, 0px));
    max-height: 80%;
    overflow-y: auto;
    animation: rise 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .grabber {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--line);
    margin: 0.5rem auto 0.4rem;
  }
  .picker-title {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin: 0.3rem 0.4rem 0.6rem;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 0.7rem 0.5rem;
    border-radius: 10px;
  }
  .prow:hover,
  .prow.current {
    background: var(--bg-elev);
  }
  .prow.current .name {
    color: var(--accent-2);
  }
  .ring {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 50% 50%, var(--bg-panel) 57%, transparent 58%),
      conic-gradient(var(--accent) var(--p, 0%), var(--line) 0);
  }
  .ring b {
    font-size: 0.6rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: block;
    font-weight: 600;
    font-size: 0.95rem;
  }
  .meta {
    display: block;
    font-size: 0.75rem;
    color: var(--text-dim);
  }
  .go {
    color: var(--text-faint);
    font-size: 1.1rem;
  }
  @keyframes rise {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .picker,
    .scrim {
      animation: none;
    }
  }
  @media (pointer: coarse) {
    .prow {
      padding: 0.85rem 0.5rem;
    }
  }
</style>
