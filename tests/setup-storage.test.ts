import { describe, it, expect, beforeEach } from 'vitest';

// Guards the test-environment Web Storage polyfill installed in setup.ts.
// Under Node's built-in (experimental) Web Storage the global `localStorage`
// can be a method-less stub, which broke every test's `afterEach` teardown
// (`localStorage.clear is not a function`). setup.ts must provide a real,
// spec-conformant in-memory Storage so tests — and the LocalBackend they
// exercise — behave deterministically regardless of the host Node/jsdom.

describe('test-environment localStorage polyfill', () => {
  beforeEach(() => localStorage.clear());

  it('exposes the full Web Storage API as functions', () => {
    for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) {
      expect(typeof localStorage[m]).toBe('function');
    }
  });

  it('stores, reads back and removes values', () => {
    expect(localStorage.getItem('missing')).toBeNull();
    localStorage.setItem('a', '1');
    localStorage.setItem('b', '2');
    expect(localStorage.getItem('a')).toBe('1');
    expect(localStorage.length).toBe(2);
    localStorage.removeItem('a');
    expect(localStorage.getItem('a')).toBeNull();
    expect(localStorage.length).toBe(1);
  });

  it('clear() empties the store', () => {
    localStorage.setItem('x', 'y');
    localStorage.clear();
    expect(localStorage.length).toBe(0);
    expect(localStorage.getItem('x')).toBeNull();
  });

  it('coerces keys and values to strings like the DOM does', () => {
    // @ts-expect-error exercising DOM coercion semantics
    localStorage.setItem(1, 2);
    expect(localStorage.getItem('1')).toBe('2');
  });

  it('is the same object as window.localStorage', () => {
    expect(window.localStorage).toBe(localStorage);
  });
});
