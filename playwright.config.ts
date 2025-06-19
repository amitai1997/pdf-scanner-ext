import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    headless: false,
    launchOptions: {
      slowMo: 1000, // Slows down Playwright operations by 1 second
    },
  },
  timeout: 30000, // 30 seconds timeout
  reporter: 'list',
});
