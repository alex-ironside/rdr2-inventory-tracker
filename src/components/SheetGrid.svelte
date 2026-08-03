<script lang="ts">
  import type { DeliveredMap, FreezeState, Sheet, SeedRow } from '../lib/types';
  import { getDelivered, rowTotals, setDelivered } from '../lib/compute';
  import { buildDisplayColumns, rowHeaderKey, statusInfo } from '../lib/grid';
  import {
    cumulativeOffsets,
    frozenColKeys,
    frozenRowIds,
    isColFrozen,
    isRowFrozen,
    orderedFrozen,
    toggleCol,
    toggleRow
  } from '../lib/freeze';
  import CellInput from './CellInput.svelte';
  import type { Scope } from '../lib/history';

  let {
    sheet,
    delivered,
    freeze,
    onDelivered,
    onFreeze,
    onCheck,
    onReset
  }: {
    sheet: Sheet;
    delivered: DeliveredMap;
    freeze: FreezeState;
    onDelivered: (next: DeliveredMap) => void;
    onFreeze: (next: FreezeState) => void;
    onCheck: (scope: Scope) => void;
    onReset: (scope: Scope) => void;
  } = $props();

  const displayCols = $derived(buildDisplayColumns(sheet));
  const headerKey = $derived(rowHeaderKey(sheet));
  const dataRows = $derived(sheet.rows.filter((r) => !r.section));

  const frozenCols = $derived(
    orderedFrozen(
      frozenColKeys(freeze, sheet.id),
      displayCols.map((c) => c.key)
    )
  );
  const frozenRows = $derived(
    orderedFrozen(
      frozenRowIds(freeze, sheet.id),
      dataRows.map((r) => r.id)
    )
  );

  // --- DOM measurement for sticky offsets (kept minimal; math lives in freeze.ts) ---
  let headerEls: Record<string, HTMLElement> = {};
  let rowEls: Record<string, HTMLElement> = {};
  let theadEl: HTMLElement | undefined = $state();
  let colLeft = $state<Record<string, number>>({});
  let rowTop = $state<Record<string, number>>({});
  let measureTick = $state(0);

  function registerHeader(node: HTMLElement, key: string) {
    headerEls[key] = node;
    return { destroy: () => delete headerEls[key] };
  }
  function registerRow(node: HTMLElement, id: string) {
    rowEls[id] = node;
    return { destroy: () => delete rowEls[id] };
  }

  $effect(() => {
    // Re-measure when structure or frozen sets change, or on resize.
    void sheet.id;
    void frozenCols;
    void frozenRows;
    void measureTick;
    const raf = requestAnimationFrame(() => {
      const widths = frozenCols.map((k) => headerEls[k]?.getBoundingClientRect().width ?? 0);
      const colOffsets = cumulativeOffsets(widths);
      const nextLeft: Record<string, number> = {};
      frozenCols.forEach((k, i) => (nextLeft[k] = colOffsets[i]));
      colLeft = nextLeft;

      const headerH = theadEl?.getBoundingClientRect().height ?? 0;
      const heights = frozenRows.map((id) => rowEls[id]?.getBoundingClientRect().height ?? 0);
      const rowOffsets = cumulativeOffsets(heights);
      const nextTop: Record<string, number> = {};
      frozenRows.forEach((id, i) => (nextTop[id] = headerH + rowOffsets[i]));
      rowTop = nextTop;
    });
    return () => cancelAnimationFrame(raf);
  });

  $effect(() => {
    const onResize = () => (measureTick += 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  // --- interactions ---
  function updateCell(rowId: string, colKey: string, value: number) {
    onDelivered(setDelivered(delivered, sheet.id, rowId, colKey, value));
  }
  function toggleColumn(colKey: string) {
    onFreeze(toggleCol(freeze, sheet.id, colKey));
  }
  function toggleRowFreeze(rowId: string) {
    onFreeze(toggleRow(freeze, sheet.id, rowId));
  }

  function rowLabel(row: SeedRow): string {
    if (headerKey && row.cells?.[headerKey]?.value) return row.cells[headerKey]!.value!;
    return row.id;
  }

  // Inline sticky style for a cell in the given column/row.
  function cellStyle(colKey: string, rowId: string | null): string {
    const parts: string[] = [];
    if (frozenCols.includes(colKey)) parts.push(`left:${colLeft[colKey] ?? 0}px`);
    if (rowId !== null && frozenRows.includes(rowId)) parts.push(`top:${rowTop[rowId] ?? 0}px`);
    return parts.join(';');
  }
  function cellClasses(colKey: string, rowId: string | null): string {
    const c: string[] = [];
    if (frozenCols.includes(colKey)) c.push('fz-col');
    if (rowId !== null && frozenRows.includes(rowId)) c.push('fz-row');
    return c.join(' ');
  }
</script>

<div class="grid-wrap">
  <div class="toolbar">
    {#if sheet.note}
      <p class="note">{sheet.note}</p>
    {/if}
    <div class="legend" aria-hidden="true">
      <span class="chip"><b>delivered</b> / required</span>
      <span class="chip pin">📌 = freeze</span>
    </div>
  </div>

  <!-- Keyboard users can scroll this region; a nonnegative tabindex on a
       scrollable region is an intentional WCAG 2.1.1 affordance. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="scroll" role="region" aria-label={`${sheet.title} table, scrollable`} tabindex="0">
    <table aria-label={`${sheet.title} crafting requirements`}>
      <caption class="sr-only">
        {sheet.title}. Enter delivered amounts against the required amounts. Use the freeze buttons
        in headers to pin columns or rows.
      </caption>
      <thead bind:this={theadEl}>
        <tr>
          {#each displayCols as col (col.key)}
            {@const frozen = isColFrozen(freeze, sheet.id, col.key)}
            <th
              scope="col"
              class="colhead {cellClasses(col.key, null)}"
              class:computed={col.computed}
              style={cellStyle(col.key, null)}
              use:registerHeader={col.key}
            >
              <div class="colhead-inner">
                <span class="colhead-label">{col.label}</span>
                {#if !col.computed && (col.type === 'tracked' || col.type === 'bool')}
                  <button
                    type="button"
                    class="act"
                    aria-label={`Check all collected in column ${col.label}`}
                    title="Set all collected = required for this column"
                    onclick={() => onCheck({ kind: 'column', colKey: col.key })}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    class="act"
                    aria-label={`Reset column ${col.label} from history`}
                    title="Reset this column to a point in history"
                    onclick={() => onReset({ kind: 'column', colKey: col.key })}
                  >
                    ↺
                  </button>
                {/if}
                <button
                  type="button"
                  class="pin"
                  class:on={frozen}
                  aria-pressed={frozen}
                  aria-label={`${frozen ? 'Unfreeze' : 'Freeze'} column ${col.label}`}
                  title={`${frozen ? 'Unfreeze' : 'Freeze'} column`}
                  onclick={() => toggleColumn(col.key)}
                >
                  📌
                </button>
              </div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each sheet.rows as row (row.id)}
          {#if row.section}
            <tr class="section">
              <th scope="colgroup" colspan={displayCols.length}>{row.label}</th>
            </tr>
          {:else}
            {@const totals = rowTotals(sheet, row, delivered)}
            {@const rFrozen = isRowFrozen(freeze, sheet.id, row.id)}
            <tr use:registerRow={row.id} class:row-complete={totals.complete}>
              {#each displayCols as col (col.key)}
                {@const isHeaderCell = col.key === headerKey}
                {@const cls = cellClasses(col.key, row.id)}
                {@const st = cellStyle(col.key, row.id)}
                {#if isHeaderCell}
                  <th scope="row" class="rowhead {cls}" style={st}>
                    <div class="rowhead-inner">
                      <button
                        type="button"
                        class="pin row-pin"
                        class:on={rFrozen}
                        aria-pressed={rFrozen}
                        aria-label={`${rFrozen ? 'Unfreeze' : 'Freeze'} row ${rowLabel(row)}`}
                        title={`${rFrozen ? 'Unfreeze' : 'Freeze'} row`}
                        onclick={() => toggleRowFreeze(row.id)}
                      >
                        📌
                      </button>
                      <span class="rowhead-label">{row.cells?.[col.key]?.value ?? ''}</span>
                      <button
                        type="button"
                        class="act"
                        aria-label={`Check all collected in row ${rowLabel(row)}`}
                        title="Set all collected = required for this row"
                        onclick={() => onCheck({ kind: 'row', rowId: row.id })}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        class="act"
                        aria-label={`Reset row ${rowLabel(row)} from history`}
                        title="Reset this row to a point in history"
                        onclick={() => onReset({ kind: 'row', rowId: row.id })}
                      >
                        ↺
                      </button>
                    </div>
                  </th>
                {:else if col.computed}
                  {#if col.key === '__status'}
                    {@const s = statusInfo(totals)}
                    <td class="num-cell status {cls}" style={st}>
                      <span class="status-badge {s.kind}">{s.text}</span>
                    </td>
                  {:else}
                    {@const val =
                      col.key === '__have'
                        ? totals.have
                        : col.key === '__needed'
                          ? totals.needed
                          : totals.remaining}
                    <td class="num-cell {cls}" class:computed={true} style={st}>{val}</td>
                  {/if}
                {:else if col.type === 'tracked'}
                  {@const cell = row.cells?.[col.key]}
                  {#if cell && cell.required != null}
                    <td class="num-cell {cls}" style={st}>
                      <CellInput
                        delivered={getDelivered(delivered, sheet.id, row.id, col.key)}
                        required={cell.required}
                        label={`${rowLabel(row)} — ${col.label}`}
                        onChange={(v) => updateCell(row.id, col.key, v)}
                      />
                    </td>
                  {:else}
                    <td class={cls} style={st}></td>
                  {/if}
                {:else if col.type === 'bool'}
                  {@const done = getDelivered(delivered, sheet.id, row.id, col.key) >= 1}
                  <td class="bool-cell {cls}" style={st}>
                    <input
                      type="checkbox"
                      checked={done}
                      aria-label={`${rowLabel(row)} ${col.label}`}
                      onchange={(e) =>
                        updateCell(row.id, col.key, (e.target as HTMLInputElement).checked ? 1 : 0)}
                    />
                  </td>
                {:else}
                  <td class="text-cell {col.type} {cls}" style={st}>
                    {row.cells?.[col.key]?.value ?? ''}
                  </td>
                {/if}
              {/each}
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .grid-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* Allow the wide, horizontally-scrolling grid inside to shrink this column
       below its content width rather than widening the page. */
    min-width: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1rem;
    flex-wrap: wrap;
  }
  .note {
    margin: 0;
    color: var(--text-dim);
    font-size: 0.85rem;
    max-width: 70ch;
  }
  .legend {
    display: flex;
    gap: 0.6rem;
  }
  .chip {
    font-size: 0.76rem;
    color: var(--text-faint);
    border: 1px solid var(--line-soft);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    white-space: nowrap;
  }
  .chip b {
    color: var(--text);
  }

  .scroll {
    flex: 1;
    /* Let this flex item shrink below its (very wide) table content instead of
       forcing the page wider than the viewport. */
    min-width: 0;
    overflow: auto;
    /* Keep the grid's horizontal scroll from bubbling to the page (and from
       triggering iOS back-swipe navigation). Do NOT add
       `-webkit-overflow-scrolling: touch` here: on iOS it routes this
       container through a legacy scroller that breaks `position: sticky`, so
       the pinned material column freezes over the data and the un-clipped
       table pushes the page past 100vw. Modern iOS scrolls with momentum
       natively. */
    overscroll-behavior: contain;
    margin: 0 0.5rem 0.5rem;
    border: 1px solid var(--line-soft);
    border-radius: 8px;
    position: relative;
  }

  table {
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.88rem;
  }

  th,
  td {
    border-right: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
    padding: 0.35rem 0.6rem;
    background: var(--bg-panel);
    text-align: left;
    vertical-align: middle;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 40;
    background: #2a2015;
    color: var(--text);
    font-family: var(--font);
    font-weight: 600;
    white-space: nowrap;
    z-index: 40;
  }
  thead th.fz-col {
    position: sticky;
    z-index: 45;
  }
  .colhead-inner,
  .rowhead-inner {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .colhead.computed {
    color: var(--accent-2);
  }

  .rowhead {
    position: sticky;
    left: 0;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    z-index: 15;
  }
  .rowhead-label {
    font-family: var(--font);
  }

  /* Frozen (pinned) cells */
  .fz-col {
    position: sticky;
    z-index: 20;
    background: #241a12;
    box-shadow: 2px 0 0 0 var(--line);
  }
  .fz-row {
    position: sticky;
    z-index: 25;
    background: #241a12;
    box-shadow: 0 2px 0 0 var(--line);
  }
  .fz-col.fz-row {
    z-index: 35;
  }

  .num-cell {
    text-align: right;
    white-space: nowrap;
  }
  .num-cell.computed {
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .text-cell.meta {
    color: var(--text-dim);
    font-size: 0.82rem;
    max-width: 30ch;
  }
  .bool-cell {
    text-align: center;
  }
  .bool-cell input {
    width: 1.15rem;
    height: 1.15rem;
    accent-color: var(--green);
    cursor: pointer;
  }

  .status-badge {
    display: inline-block;
    font-size: 0.74rem;
    font-weight: 700;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .status-badge.complete {
    background: var(--green);
    color: #10160a;
  }
  .status-badge.partial {
    background: #c8843c33;
    color: var(--accent-2);
    border: 1px solid #c8843c66;
  }
  .status-badge.todo {
    background: #b5462f2a;
    color: #e8917a;
    border: 1px solid #b5462f55;
  }
  .status-badge.none {
    color: var(--text-faint);
  }

  tr.row-complete .rowhead-label {
    color: var(--green-bright);
  }

  tr.section th {
    position: sticky;
    left: 0;
    background: linear-gradient(90deg, #3a2a1a, #2a2015);
    color: var(--accent-2);
    font-family: var(--font);
    font-size: 0.92rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.5rem 0.7rem;
    z-index: 12;
  }

  .pin {
    background: transparent;
    border: none;
    font-size: 0.72rem;
    line-height: 1;
    padding: 0.15rem;
    border-radius: 4px;
    filter: grayscale(1) opacity(0.4);
    transition:
      filter 0.12s ease,
      background 0.12s ease;
  }
  .pin:hover {
    filter: grayscale(0) opacity(1);
    background: #ffffff12;
  }
  .pin.on {
    filter: grayscale(0) opacity(1);
    background: var(--accent);
  }

  .act {
    background: transparent;
    border: 1px solid var(--line-soft);
    color: var(--text-dim);
    font-size: 0.72rem;
    line-height: 1;
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 5px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .act:hover {
    background: var(--accent);
    color: var(--accent-ink);
    border-color: var(--accent);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Touch devices: the freeze pin and the check/reset buttons live in dense
     headers, so give them finger-sized hit areas. */
  @media (pointer: coarse) {
    .act {
      width: 1.9rem;
      height: 1.9rem;
      font-size: 0.85rem;
    }
    .pin {
      font-size: 0.9rem;
      padding: 0.35rem;
    }
    .bool-cell input {
      width: 1.4rem;
      height: 1.4rem;
    }
  }

  @media (max-width: 640px) {
    .toolbar {
      padding: 0.5rem 0.7rem;
      gap: 0.5rem;
    }
    .scroll {
      margin: 0 0.4rem 0.4rem;
    }
    /* The Material column is sticky (pinned left). On a phone its default
       content-width can exceed the viewport, so the frozen column covers the
       whole screen and the tracked columns can never be scrolled into view.
       Cap it and let long material names wrap so the data columns stay
       reachable. */
    th.rowhead {
      max-width: 46vw;
      white-space: normal;
    }
    .rowhead-label {
      overflow-wrap: anywhere;
    }
    .rowhead-inner {
      flex-wrap: wrap;
      gap: 0.25rem 0.35rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
    }
  }
</style>
