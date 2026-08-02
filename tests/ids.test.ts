import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateId, randomSuffix } from '../src/lib/ids';

afterEach(() => vi.unstubAllGlobals());

describe('randomSuffix', () => {
  it('uses crypto.getRandomValues when available', () => {
    const getRandomValues = vi.fn((arr: Uint32Array) => {
      arr[0] = 10;
      arr[1] = 20;
      return arr;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const s = randomSuffix();
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(s).toBe((10).toString(36) + (20).toString(36));
  });

  it('falls back to Math.random when crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const s = randomSuffix();
    expect(spy).toHaveBeenCalled();
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

describe('generateId', () => {
  it('produces a prefixed, unique-ish id', () => {
    const a = generateId();
    const b = generateId();
    expect(a.startsWith('it_')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('honours a custom prefix', () => {
    expect(generateId('pt').startsWith('pt_')).toBe(true);
  });
});
