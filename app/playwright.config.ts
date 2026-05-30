import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8082',
    headless: true,
  },
  webServer: {
    command: 'npx expo start --web --port 8082',
    url: process.env.E2E_BASE_URL ?? 'http://localhost:8082',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
