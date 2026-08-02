import { describe, it, expect } from 'vitest';
import { formatDateTime, formatShort } from '../src/lib/format';

const EM_DASH = '—';
const ts = Date.UTC(2026, 7, 2, 18, 30); // 2 Aug 2026

describe('formatDateTime', () => {
  it('returns an em dash for 0 / falsy input', () => {
    expect(formatDateTime(0)).toBe(EM_DASH);
  });

  it('formats a real timestamp including the year', () => {
    const out = formatDateTime(ts);
    expect(out).toMatch(/2026/);
    expect(out).not.toBe(EM_DASH);
  });
});

describe('formatShort', () => {
  it('returns an em dash for 0 / falsy input', () => {
    expect(formatShort(0)).toBe(EM_DASH);
  });

  it('formats without the year', () => {
    const out = formatShort(ts);
    expect(out).not.toMatch(/2026/);
    expect(out).not.toBe(EM_DASH);
  });
});
