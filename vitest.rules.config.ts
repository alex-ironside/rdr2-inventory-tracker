import { defineConfig } from 'vitest/config';

// Config for the Firestore security-rules tests (tests/rules/**). These talk to
// the real Firebase emulators over the network, so they run in a Node
// environment, without coverage, and are kept out of the main jsdom unit suite
// (which excludes tests/rules/**). Driven by `npm run test:rules`, which wraps
// this in `firebase emulators:exec`.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20000
  }
});
