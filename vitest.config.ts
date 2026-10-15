import { defineConfig } from 'vitest/config';

// Tests run in Node without the app's Vite plugins: the engine and the app's state logic are
// plain TypeScript.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
