import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Web Storage polyfill. On Node >= 24 the runtime ships an experimental
// built-in Web Storage; when started without a valid `--localstorage-file`
// path the global `localStorage` is a method-less stub, so jsdom exposes that
// broken object as `window.localStorage` and every teardown here threw
// `localStorage.clear is not a function`. Install a real, spec-shaped
// in-memory Storage so tests (and the LocalBackend they exercise) are
// deterministic regardless of the host Node/jsdom version.
class MemoryStorage implements Storage {
  #map = new Map<string, string>();
  get length(): number {
    return this.#map.size;
  }
  key(index: number): string | null {
    return Array.from(this.#map.keys())[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.#map.has(String(key)) ? this.#map.get(String(key))! : null;
  }
  setItem(key: string, value: string): void {
    this.#map.set(String(key), String(value));
  }
  removeItem(key: string): void {
    this.#map.delete(String(key));
  }
  clear(): void {
    this.#map.clear();
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  const current = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
  // Only replace a missing or broken (method-less) Storage; leave a working
  // one alone.
  if (current && typeof current.clear === 'function') return;
  const store = new MemoryStorage();
  const define = (target: object) =>
    Object.defineProperty(target, name, { value: store, configurable: true, writable: true });
  define(globalThis);
  if (typeof window !== 'undefined' && window !== (globalThis as unknown)) define(window);
}
installStorage('localStorage');
installStorage('sessionStorage');

// jsdom lacks requestAnimationFrame timing guarantees; provide a deterministic
// shim so grid measurement effects run synchronously in tests.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) =>
    clearTimeout(id)) as typeof cancelAnimationFrame;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});
