import { describe, it, expect } from 'vitest';
import { normalizeTitle, DEFAULT_TITLE, MAX_TITLE_LENGTH } from '../src/lib/title';

describe('normalizeTitle', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeTitle('  Honor run  ')).toBe('Honor run');
  });

  it('falls back to the default when empty or whitespace', () => {
    expect(normalizeTitle('')).toBe(DEFAULT_TITLE);
    expect(normalizeTitle('    ')).toBe(DEFAULT_TITLE);
  });

  it('falls back to the default for null / undefined input', () => {
    // @ts-expect-error exercising defensive runtime path
    expect(normalizeTitle(null)).toBe(DEFAULT_TITLE);
    // @ts-expect-error exercising defensive runtime path
    expect(normalizeTitle(undefined)).toBe(DEFAULT_TITLE);
  });

  it('strips ASCII control characters', () => {
    const withControls = 'a' + String.fromCharCode(0, 9, 13, 31, 127) + 'bcd';
    expect(normalizeTitle(withControls)).toBe('abcd');
  });

  it('bounds the length to MAX_TITLE_LENGTH', () => {
    const long = 'x'.repeat(200);
    expect(normalizeTitle(long)).toHaveLength(MAX_TITLE_LENGTH);
  });
});
