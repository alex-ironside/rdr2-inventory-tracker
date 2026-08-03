<script lang="ts">
  // Delivered / required editor for a single tracked cell.
  // Delivered is user-editable; required comes from the seed template.
  let {
    delivered,
    required,
    label,
    onChange
  }: {
    delivered: number;
    required: number;
    label: string;
    onChange: (value: number) => void;
  } = $props();

  const complete = $derived(required > 0 && delivered >= required);

  function set(v: number) {
    onChange(Math.max(0, Math.floor(Number.isFinite(v) ? v : 0)));
  }
  function dec() {
    set(delivered - 1);
  }
  function inc() {
    set(delivered + 1);
  }
  function onInput(e: Event) {
    set(parseInt((e.target as HTMLInputElement).value, 10));
  }
</script>

<div class="cell" class:complete>
  <button
    type="button"
    class="step"
    onclick={dec}
    disabled={delivered <= 0}
    aria-label={`Decrease ${label} delivered`}
    tabindex="-1"
  >
    −
  </button>
  <span class="pair">
    <input
      class="num"
      type="number"
      inputmode="numeric"
      min="0"
      value={delivered}
      oninput={onInput}
      aria-label={`${label} delivered, ${required} required`}
    />
    <span class="req" aria-hidden="true">/ {required}</span>
  </span>
  <button
    type="button"
    class="step"
    onclick={inc}
    aria-label={`Increase ${label} delivered`}
    tabindex="-1"
  >
    +
  </button>
  {#if complete}
    <span class="check" aria-hidden="true">✓</span>
  {/if}
</div>

<style>
  .cell {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.1rem;
    border-radius: 6px;
    white-space: nowrap;
  }
  .cell.complete {
    background: #6f8f3a22;
  }
  .pair {
    display: inline-flex;
    align-items: baseline;
    gap: 0.15rem;
  }
  .num {
    width: 2.6rem;
    text-align: right;
    background: #120d08;
    border: 1px solid var(--line);
    border-radius: 5px;
    color: var(--text);
    padding: 0.2rem 0.3rem;
    font-size: 0.9rem;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .num::-webkit-outer-spin-button,
  .num::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .cell.complete .num {
    border-color: var(--green);
  }
  .req {
    color: var(--text-faint);
    font-size: 0.82rem;
    min-width: 1.4rem;
  }
  .step {
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 5px;
    border: 1px solid var(--line);
    background: #2a1f16;
    color: var(--text-dim);
    font-size: 0.95rem;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }
  .step:hover:not(:disabled) {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: var(--accent);
  }
  .step:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .check {
    color: var(--green-bright);
    font-weight: 700;
    margin-left: 0.1rem;
  }

  /* Touch devices: enlarge the stepper buttons and number field so a fingertip
     can hit them reliably (the desktop 1.35rem targets are far too small). */
  @media (pointer: coarse) {
    .cell {
      gap: 0.3rem;
    }
    .step {
      width: 2.4rem;
      height: 2.4rem;
      font-size: 1.25rem;
    }
    .num {
      width: 3rem;
      /* 16px avoids iOS focus-zoom (see app.css). */
      font-size: 16px;
      padding: 0.4rem 0.35rem;
    }
    .req {
      font-size: 0.9rem;
    }
  }
</style>
