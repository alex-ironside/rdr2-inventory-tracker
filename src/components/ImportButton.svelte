<script lang="ts">
  // Upload an RDR2 crafting spreadsheet and hand the parsed progress back to the
  // parent to merge. Parsing (xlsx → grid) and mapping (grid → DeliveredMap)
  // live in the pure lib; this component is just the file-picker + status.
  import { onDestroy } from 'svelte';
  import { fileToWorkbook } from '../lib/xlsx';
  import { importWorkbook, type ImportSummary } from '../lib/import';
  import type { DeliveredMap } from '../lib/types';

  let {
    onImport,
    // How long the success confirmation stays before auto-dismissing (ms). It is
    // a transient toast, not persistent state — left up, it lingers over the
    // header and can even sit on top of other controls.
    hideDelayMs = 5000
  }: {
    onImport: (delivered: DeliveredMap, summary: ImportSummary) => void | Promise<void>;
    hideDelayMs?: number;
  } = $props();

  let input = $state<HTMLInputElement>();
  let busy = $state(false);
  let error = $state<string | null>(null);
  let summary = $state<ImportSummary | null>(null);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  function clearSummary() {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    summary = null;
  }

  function pick() {
    error = null;
    clearSummary();
    input?.click();
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    busy = true;
    error = null;
    clearSummary();
    try {
      const wb = await fileToWorkbook(file);
      const result = importWorkbook(wb);
      await onImport(result.delivered, result.summary);
      summary = result.summary;
      // Auto-dismiss the confirmation so it never lingers on screen.
      hideTimer = setTimeout(clearSummary, hideDelayMs);
    } catch (err) {
      error = `Couldn't read that file. Make sure it's the RDR2 crafting .xlsx. (${(err as Error).message})`;
    } finally {
      busy = false;
      // Allow re-selecting the same file.
      if (input) input.value = '';
    }
  }

  onDestroy(() => clearTimeout(hideTimer));
</script>

<div class="import">
  <button class="btn-ghost import-btn" onclick={pick} disabled={busy} title="Import from Excel">
    {busy ? 'Importing…' : '⬆ Import Excel'}
  </button>
  <input
    bind:this={input}
    class="file"
    type="file"
    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    aria-label="Choose an RDR2 crafting spreadsheet to import"
    onchange={onFile}
  />

  {#if error}
    <span class="msg err" role="alert">{error}</span>
  {:else if summary}
    <span class="msg ok" role="status">
      Imported {summary.itemsImported} item{summary.itemsImported === 1 ? '' : 's'}
      ({summary.collectedTotal} collected){summary.unmatched.length
        ? ` · ${summary.unmatched.length} not recognised`
        : ''}.
    </span>
  {/if}
</div>

<style>
  .import {
    position: relative;
    display: flex;
    align-items: center;
  }
  .import-btn {
    white-space: nowrap;
  }
  /* Visually hidden but still operable (we drive it from the button). */
  .file {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  /* Float the result under the button as a small popover so it never squeezes
     the header controls on a narrow screen. */
  .msg {
    position: absolute;
    top: calc(100% + 0.35rem);
    right: 0;
    z-index: 30;
    max-width: min(78vw, 320px);
    font-size: 0.78rem;
    line-height: 1.35;
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    background: var(--bg-elev);
    border: 1px solid var(--line-soft);
    box-shadow: var(--shadow);
  }
  .msg.ok {
    color: var(--green-bright);
  }
  .msg.err {
    color: #e88b74;
  }
</style>
