import { expect } from '@playwright/test';
import { test } from './extension.fixture';

// Simple test to ensure popup loads and displays default status

test('popup shows active status', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/public/popup.html`);
  const status = await page.locator('.status-text').textContent();
  expect(status).toContain('Active');
});
