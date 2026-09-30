import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// 🔒 base 上線後不可修改（見 CLAUDE.md §1）
export default defineConfig({
  base: '/inkbook/',
  plugins: [preact()],
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
  preview: { port: Number(process.env.PORT) || 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
