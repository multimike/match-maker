import { configDefaults, defineConfig } from 'vitest/config';

// Tests run in Node without the app's Vite plugins: the engine and the app's state logic are
// plain TypeScript. The security rules have their own config (vitest.rules.config.ts), since
// they need the Firestore emulator.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'test/rules/**'],
  },
});
