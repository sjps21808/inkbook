import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const require = createRequire(import.meta.url);

// pdf.js worker 以固定檔名輸出到 dist，讓 service worker 預先快取（M5 用 BASE_URL + 檔名載入）
function pdfWorker(): Plugin {
  return {
    name: 'inkbook-pdf-worker',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'pdf.worker.min.mjs',
        source: readFileSync(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs')),
      });
    },
  };
}

// 🔒 base、manifest id、scope 上線後不可修改（見 CLAUDE.md §1）
export default defineConfig({
  base: '/inkbook/',
  plugins: [
    preact(),
    pdfWorker(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false, // globPatterns 已包含圖示，避免重複
      manifest: {
        id: '/inkbook/',
        scope: '/inkbook/',
        start_url: '/inkbook/',
        name: 'InkBook',
        short_name: 'InkBook',
        lang: 'zh-Hant',
        display: 'standalone',
        background_color: '#f2f2f5',
        theme_color: '#1f3a5f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,ttf,txt}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
  preview: { port: Number(process.env.PORT) || 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
