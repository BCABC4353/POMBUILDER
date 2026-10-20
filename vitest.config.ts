import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  plugins: [
    {
      name: 'stub-generated-config',
      enforce: 'pre',
      resolveId(source) {
        if (source.endsWith('azure-config.generated')) {
          return path.resolve(__dirname, 'src/test/fixtures/azure-config.stub.ts');
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@ds': path.resolve(__dirname, 'design_system/ds'),
      '@design': path.resolve(__dirname, 'design_system'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
      ],
    },
  },
});
