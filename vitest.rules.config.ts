import { defineConfig } from 'vitest/config';

// The security rules tests: run by `npm run test:rules` inside the Firestore emulator.
export default defineConfig({
  test: {
    include: ['test/rules/**/*.test.ts'],
    testTimeout: 15_000,
    fileParallelism: false,
  },
});
