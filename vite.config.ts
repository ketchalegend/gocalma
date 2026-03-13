import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  preview: {
    allowedHosts: ['gocalme.ketchalegend.me', 'localhost', '91.99.223.183'],
    proxy: {
      '/hf': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hf/, ''),
      },
    },
  },
  server: {
    proxy: {
      '/hf': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hf/, ''),
      },
    },
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    globals: true,
  },
});
