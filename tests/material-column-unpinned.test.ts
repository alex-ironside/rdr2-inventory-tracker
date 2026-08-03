import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard: the material (row-header) column must NOT be pinned to the
// left by default. Its stickiness is owned by the freeze state (`.fz-col`,
// toggled by the column pin button), never hard-coded in `.rowhead`. When
// `.rowhead` declared `position: sticky; left: 0` unconditionally, the column
// was frozen with no way to unpin it — the pin toggle had no effect because the
// hard-coded rule always won.
const src = readFileSync(resolve(process.cwd(), 'src/components/SheetGrid.svelte'), 'utf8');

/** Extract the body of a top-level CSS rule by its selector, with CSS comments
 *  stripped so assertions target real declarations, not explanatory notes. */
function ruleBody(selector: string): string {
  const idx = src.indexOf(`${selector} {`);
  if (idx === -1) throw new Error(`selector not found: ${selector}`);
  const open = src.indexOf('{', idx);
  const close = src.indexOf('}', open);
  return src.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('material column is not pinned by default', () => {
  it('.rowhead does not force position: sticky', () => {
    expect(ruleBody('.rowhead')).not.toMatch(/position\s*:\s*sticky/);
  });

  it('.rowhead does not force left: 0', () => {
    expect(ruleBody('.rowhead')).not.toMatch(/left\s*:\s*0/);
  });
});
