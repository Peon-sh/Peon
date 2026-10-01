import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup-dom.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'eslint-rules/**/*.test.mjs'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'src/test/integration/**',
      '**/*.integration.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
