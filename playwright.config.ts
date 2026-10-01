import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  // Windows 上同時開太多 WebKit 會讓導覽卡住超過 30 秒（6 workers 時約半數執行出錯）
  workers: 3,
  // 預設擋掉 SW，一般測試不受快取影響；需要 SW 的測試自行 test.use 開啟
  use: { baseURL: `http://localhost:${port}/inkbook/`, serviceWorkers: 'block' },
  projects: [
    { name: 'webkit', testIgnore: /pdf-perf/, use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
    // 匯入 500 頁 PDF 的計時測試：等其他測試跑完才單獨執行，避免和其他 WebKit 搶資源而超過 10 秒
    {
      name: 'perf',
      testMatch: /pdf-perf/,
      dependencies: ['webkit'],
      use: { ...devices['iPad Pro 11'], browserName: 'webkit' },
    },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview',
    url: `http://localhost:${port}/inkbook/`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(port) },
  },
});
