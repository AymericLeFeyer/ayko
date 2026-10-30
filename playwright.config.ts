import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: 'http://localhost:3110', locale: 'fr-FR' },
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://localhost:3110/health',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
