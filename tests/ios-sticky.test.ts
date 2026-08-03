import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Regression guard for the iOS layout breakage (frozen material column + page
// wider than the viewport).
//
// On iOS Safari, `position: sticky` does NOT work for children of a scroll
// container that declares `-webkit-overflow-scrolling: touch`: that property
// routes the container through a legacy UIScrollView-backed scroller which
// predates sticky support. The pinned material/header column then paints at a
// fixed document position (it looks "frozen" and overlaps the data), and the
// un-clipped sticky content extends the page past 100vw. Modern iOS does
// momentum scrolling natively, so the property is pure downside here.
//
// The scroll containers (`.scroll` grid + `.tabs`) must therefore never
// declare it. jsdom/Chromium can't reproduce the WebKit-only rendering bug, so
// this asserts on the source directly.
const files = {
  SheetGrid: '../src/components/SheetGrid.svelte',
  TrackerView: '../src/components/TrackerView.svelte'
};

describe('iOS sticky-safe scroll containers', () => {
  for (const [name, rel] of Object.entries(files)) {
    it(`${name} does not use -webkit-overflow-scrolling (breaks position:sticky on iOS)`, () => {
      const src = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
      // Strip comments so the assertion targets real declarations, not the
      // explanatory notes that name the property on purpose.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code).not.toMatch(/-webkit-overflow-scrolling/);
    });
  }
});
