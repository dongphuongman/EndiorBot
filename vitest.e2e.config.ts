import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts', 'tests/**/*.e2e.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@config': resolve(__dirname, './src/config'),
      '@utils': resolve(__dirname, './src/utils'),
      '@agents': resolve(__dirname, './src/agents'),
      '@security': resolve(__dirname, './src/security'),
      '@sdlc': resolve(__dirname, './src/sdlc'),
      '@providers': resolve(__dirname, './src/providers'),
    },
  },
});
