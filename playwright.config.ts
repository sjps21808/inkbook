import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${port}/inkbook/` },
  projects: [{ name: 'webkit', use: { ...devices['iPad Pro 11'], browserName: 'webkit' } }],
  webServer: {
    command: 'npx vite build && npx vite preview',
    url: `http://localhost:${port}/inkbook/`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(port) },
  },
});
