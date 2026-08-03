<script lang="ts">
  // One material/recipe card in the mobile list. Collapsed it shows name,
  // subtitle, an aggregate progress meter and a text status; expanded it reveals
  // a stepper per tracked part (reusing CellInput) plus row-level actions.
  import type { CardItem } from '../lib/cardlist';
  import { statusInfo } from '../lib/grid';
  import CellInput from './CellInput.svelte';

  let {
    item,
    open,
    onToggle,
    onDeliver,
    onCheck,
    onReset
  }: {
    item: CardItem;
    open: boolean;
    onToggle: () => void;
    onDeliver: (colKey: string, value: number) => void;
    onCheck: () => void;
    onReset: () => void;
  } = $props();

  // buildCards only emits cards with needed > 0, so the division is always safe.
  const status = $derived(statusInfo(item.totals));
  const percent = $derived(
    Math.min(100, Math.round((item.totals.have / item.totals.needed) * 100))
  );
  const detailId = $derived(`card-${item.rowId}`);
</script>

<div class="mat-card status-{item.status}" class:open>
  <button
    type="button"
    class="head"
    aria-expanded={open}
    aria-controls={detailId}
    onclick={onToggle}
  >
    <span class="info">
      <span class="name">{item.name}</span>
      {#if item.sub}<span class="sub">{item.sub}</span>{/if}
      <span class="meter" aria-hidden="true"><i style="width:{percent}%"></i></span>
    </span>
    <span class="right">
      <span class="count">{item.totals.have}<small>/{item.totals.needed}</small></span>
      <span class="pill">{status.text}</span>
    </span>
  </button>

  {#if open}
    <div class="detail" id={detailId}>
      <ul class="parts">
        {#each item.parts as part (part.colKey)}
          <li class="part">
            <span class="part-label">{part.label}</span>
            {#if part.kind === 'bool'}
              <label class="bool">
                <input
                  type="checkbox"
                  checked={part.delivered >= 1}
                  aria-label={`${item.name} ${part.label}`}
                  onchange={(e) =>
                    onDeliver(part.colKey, (e.target as HTMLInputElement).checked ? 1 : 0)}
                />
                <span>{part.delivered >= 1 ? 'Done' : 'Not done'}</span>
              </label>
            {:else}
              <CellInput
                delivered={part.delivered}
                required={part.required}
                label={`${item.name} — ${part.label}`}
                onChange={(v) => onDeliver(part.colKey, v)}
              />
            {/if}
          </li>
        {/each}
      </ul>
      <div class="actions">
        <button type="button" class="btn mini" onclick={onCheck}>Mark all collected</button>
        <button type="button" class="btn-ghost mini" onclick={onReset}>Reset…</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .mat-card {
    background: var(--bg-panel);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .mat-card.open {
    border-color: var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: var(--text);
    padding: 0.75rem 0.8rem;
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  .name {
    display: block;
    font-weight: 600;
    font-size: 0.95rem;
    line-height: 1.25;
  }
  .sub {
    display: block;
    font-size: 0.76rem;
    color: var(--text-dim);
    margin-top: 1px;
  }
  .meter {
    display: block;
    height: 5px;
    border-radius: 3px;
    background: var(--line-soft);
    margin-top: 0.5rem;
    overflow: hidden;
  }
  .meter i {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
    transition: width 0.25s ease;
  }
  .status-complete .meter i {
    background: var(--green-bright);
  }
  .right {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.3rem;
  }
  .count {
    font-weight: 700;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }
  .count small {
    color: var(--text-dim);
    font-weight: 500;
  }
  .pill {
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .status-todo .pill {
    background: #b5462f22;
    color: #e0a06f;
  }
  .status-partial .pill {
    background: #c8843c22;
    color: var(--accent-2);
  }
  .status-complete .pill {
    background: #6f8f3a2e;
    color: var(--green-bright);
  }
  .detail {
    padding: 0.2rem 0.8rem 0.85rem;
    border-top: 1px dashed var(--line-soft);
  }
  .parts {
    list-style: none;
    margin: 0.4rem 0 0;
    padding: 0;
  }
  .part {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    padding: 0.4rem 0;
  }
  .part-label {
    font-size: 0.86rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .bool {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: var(--text-dim);
    white-space: nowrap;
  }
  .bool input {
    width: 1.3rem;
    height: 1.3rem;
    accent-color: var(--green);
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.7rem;
  }
  .mini {
    flex: 1;
    padding: 0.5rem;
    font-size: 0.82rem;
  }
  @media (pointer: coarse) {
    .head {
      padding: 0.9rem 0.8rem;
    }
    .bool input {
      width: 1.6rem;
      height: 1.6rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .meter i {
      transition: none;
    }
  }
</style>
