import { expect } from '@playwright/test';
import { test } from './extension.fixture';

// Simple test to ensure popup loads and displays default status

test('popup shows active status', async ({ context, extensionId }) => {
  const page = await context.newPage();
  
  // Navigate to the extension popup
  console.log('Opening extension popup...');
  await page.goto(`chrome-extension://${extensionId}/public/popup.html`);
  
  // Wait for the status element to be visible
  const statusElement = page.locator('.status-text');
  await statusElement.waitFor({ state: 'visible' });
  
  // Get and log the status
  const status = await statusElement.textContent();
  console.log('Current status:', status);
  
  // Verify the status
  expect(status).toContain('Active');
  
  // Pause for debugging - will keep browser open until you hit 'Resume' in the Playwright Inspector
  await page.pause();
  
  console.log('Test completed');
});
