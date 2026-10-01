import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { defineConfig, type Plugin } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const require = createRequire(import.meta.url);
const { version } = require('./package.json') as { version: string };

// pdf.js 的 worker 與資源以固定路徑輸出到 dist，讓 service worker 預先快取（離線也能匯入與顯示 PDF）
const PDFJS = dirname(require.resolve('pdfjs-dist/package.json'));
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
// wasm 目錄只要解碼器本身；quickjs 是 PDF 內嵌 JS 用的，不需要
const skip = (dir: string, f: string) => dir === 'wasm' && (f.startsWith('quickjs') || f.endsWith('.js'));

/** [輸出路徑（相對 base）, 來源檔案] */
function pdfAssets(): [string, string][] {
  const list: [string, string][] = [['pdf.worker.min.mjs', join(PDFJS, 'build/pdf.worker.min.mjs')]];
  for (const dir of PDFJS_DIRS) {
    for (const f of readdirSync(join(PDFJS, dir))) {
      if (!skip(dir, f)) list.push([`pdfjs/${dir}/${f}`, join(PDFJS, dir, f)]);
    }
  }
  return list;
}

function pdfWorker(): Plugin {
  return {
    name: 'inkbook-pdf-worker',
    generateBundle() {
      for (const [fileName, src] of pdfAssets()) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(src) });
      }
    },
    // dev server 也提供同樣的路徑
    configureServer(server) {
      const files = new Map(pdfAssets().map(([name, src]) => [`/inkbook/${name}`, src]));
      server.middlewares.use((req, res, next) => {
        const src = files.get((req.url ?? '').split('?')[0]);
        if (!src) return next();
        const type = src.endsWith('.mjs') ? 'text/javascript' : src.endsWith('.wasm') ? 'application/wasm' : '';
        if (type) res.setHeader('Content-Type', type);
        res.end(readFileSync(src));
      });
    },
  };
}

// CSP（GitHub Pages 無法設定 header，用 meta）；只在 build 加入，避免干擾 dev server 的 HMR
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'", // pdf.js 的 wasm 解碼器（2026-10-01 使用者同意）
  "style-src 'self' 'unsafe-inline'", // eruda 會插入 <style>
  "img-src 'self' blob:",
  "worker-src 'self' blob:", // pdf.js worker
  "connect-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'inkbook-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

// 🔒 base、manifest id、scope 上線後不可修改（見 CLAUDE.md §1）
export default defineConfig({
  base: '/inkbook/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    preact(),
    pdfWorker(),
    csp(),
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
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,ttf,txt,bcmap,pfb,wasm,icc}'],
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
