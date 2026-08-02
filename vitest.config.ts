import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [svelte({ hot: false }), svelteTesting()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,js}'],
    // The main inventory sheet renders ~800 cell components; under coverage
    // instrumentation a full render + debounce cycle can exceed the 5s default.
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json'],
      include: ['src/**/*.{ts,svelte}'],
      exclude: [
        'src/main.ts',
        'src/vite-env.d.ts',
        'src/lib/seed.ts',
        'src/lib/types.ts',
        'src/**/*.d.ts'
      ],
      thresholds: {
        // Business logic (pure, framework-free): a genuine 100% on every metric.
        'src/lib/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        },
        // UI components: every statement, line and function is exercised. A small
        // number of Svelte-compiler-generated and defensive branches (e.g. `?.`
        // fallbacks for not-yet-mounted element refs, `|| !session.backend`
        // guards that never fire in an authenticated view) remain — see CLAUDE.md
        // "Testing" for the rationale. Branch coverage is held at a high bar.
        'src/**/*.svelte': {
          statements: 100,
          branches: 88,
          functions: 100,
          lines: 100
        }
      }
    }
  }
});
