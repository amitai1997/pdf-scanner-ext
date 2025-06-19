import { expect } from '@playwright/test';
import { test } from './extension.fixture';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server: http.Server;
let PORT: number;

test.describe('PDF Upload Tests', () => {
  test.beforeAll(async () => {
    // Find an available port
    PORT = await new Promise((resolve) => {
      const testServer = http.createServer();
      testServer.listen(0, () => {
        const address = testServer.address();
        const port = typeof address === 'object' && address ? address.port : 3333;
        testServer.close(() => resolve(port));
      });
    });

    // Create a simple HTTP server to serve our test page
    server = http.createServer((req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https://localhost:* data: blob:;"
      });
      res.end(`
        <html>
          <head>
            <title>Mock ChatGPT</title>
            <meta name="color-scheme" content="dark">
          </head>
          <body>
            <div class="chat-container">
              <button aria-label="upload file">Upload</button>
              <input type="file" style="display: none" />
              <div class="attachments"></div>
            </div>
            <script>
              const button = document.querySelector('button');
              const input = document.querySelector('input');
              const attachments = document.querySelector('.attachments');
              
              button.addEventListener('click', () => {
                input.click();
              });
              
              input.addEventListener('change', () => {
                if (input.files.length > 0) {
                  const file = input.files[0];
                  const div = document.createElement('div');
                  div.setAttribute('data-testid', 'attachment');
                  div.textContent = file.name;
                  attachments.appendChild(div);
                }
              });

              window.addEventListener('message', (event) => {
                console.log('Window message:', event.data);
              });
            </script>
          </body>
        </html>
      `);
    });
    
    await new Promise<void>((resolve) => {
      server.listen(PORT, () => {
        console.log(`Mock server running at http://localhost:${PORT}`);
        resolve();
      });
    });
  });

  test.afterAll(async () => {
    // Clean up the server
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to our mock server
    await page.goto(`http://localhost:${PORT}`);
    
    // Wait for extension's content script to be injected
    await page.waitForTimeout(2000);

    // Add logging for debugging
    page.on('console', msg => {
      console.log(`[Page ${msg.type()}] ${msg.text()}`);
    });
  });

  test('should allow uploading safe PDF', async ({ page }) => {
    // Wait for the file upload button to be visible
    const uploadButton = page.locator('button[aria-label="upload file"]');
    await uploadButton.waitFor({ state: 'visible' });
    
    // Prepare file input for upload
    const fileInput = page.locator('input[type="file"]');
    
    // Get the absolute path to the test PDF
    const safePdfPath = path.join(__dirname, 'fixtures', 'safe.pdf');
    
    // Upload the file
    await fileInput.setInputFiles(safePdfPath);
    
    // Wait for processing
    await page.waitForTimeout(3000);
    
    // Check what indicators are shown - using correct IDs based on PDFMonitorUI implementation
    const warningModal = page.locator('#pdf-scanner-security-warning');
    const indicator = page.locator('#pdf-scanner-indicator');
    
    console.log('Checking indicators for safe PDF...');
    
    // Check visibility
    const warningVisible = await warningModal.isVisible().catch(() => false);
    const indicatorVisible = await indicator.isVisible().catch(() => false);
    
    // If indicator is visible, check what type it is
    let indicatorType: 'safe' | 'error' | 'scanning' | null = null;
    if (indicatorVisible) {
      const hasSuccessClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-success-bg'));
      const hasWarningClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-warning-bg'));
      const hasInfoClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-info-bg'));
      
      if (hasSuccessClass) indicatorType = 'safe';
      else if (hasWarningClass) indicatorType = 'error';
      else if (hasInfoClass) indicatorType = 'scanning';
    }
    
    console.log(`Warning modal visible: ${warningVisible}`);
    console.log(`Indicator visible: ${indicatorVisible}, type: ${indicatorType}`);
    
    // For a safe PDF, we should see either:
    // 1. Safe indicator (if parsing succeeded and no issues detected)
    // 2. Nothing (if scan is still in progress or completed without issues)
    // We should NOT see both warning modal and safe indicator
    
    if (warningVisible && indicatorType === 'safe') {
      throw new Error('Both warning modal and safe indicator are visible - this should not happen for a safe PDF');
    }
    
    // We should NOT see an error indicator for a safe PDF
    if (indicatorType === 'error') {
      throw new Error('Error indicator shown for safe PDF - this should not happen');
    }
    
    // Verify the file appears in the attachments
    const attachment = page.locator('[data-testid="attachment"]');
    await expect(attachment).toBeVisible();
    await expect(attachment).toContainText('safe.pdf');
  });

  test('should block uploading PDF with secrets', async ({ page }) => {
    // Wait for the file upload button to be visible
    const uploadButton = page.locator('button[aria-label="upload file"]');
    await uploadButton.waitFor({ state: 'visible' });
    
    // Prepare file input for upload
    const fileInput = page.locator('input[type="file"]');
    
    // Get the absolute path to the test PDF
    const secretsPdfPath = path.join(__dirname, 'fixtures', 'with-secrets.pdf');
    
    // Upload the file
    await fileInput.setInputFiles(secretsPdfPath);
    
    // Wait for file processing
    await page.waitForTimeout(3000);
    
    // Check what indicators are shown - using correct IDs
    const warningModal = page.locator('#pdf-scanner-security-warning');
    const indicator = page.locator('#pdf-scanner-indicator');
    
    console.log('Checking indicators for PDF with secrets...');
    
    // Check visibility
    const warningVisible = await warningModal.isVisible().catch(() => false);
    const indicatorVisible = await indicator.isVisible().catch(() => false);
    
    // If indicator is visible, check what type it is
    let indicatorType: 'safe' | 'error' | 'scanning' | null = null;
    if (indicatorVisible) {
      const hasSuccessClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-success-bg'));
      const hasWarningClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-warning-bg'));
      const hasInfoClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-info-bg'));
      
      if (hasSuccessClass) indicatorType = 'safe';
      else if (hasWarningClass) indicatorType = 'error';
      else if (hasInfoClass) indicatorType = 'scanning';
    }
    
    console.log(`Warning modal visible: ${warningVisible}`);
    console.log(`Indicator visible: ${indicatorVisible}, type: ${indicatorType}`);
    
    // For a PDF with secrets, we should ONLY see the warning modal
    expect(warningVisible).toBe(true);
    expect(indicatorType).not.toBe('safe'); // Should never show safe indicator
    
    // Verify warning appears
    await expect(warningModal).toBeVisible({ timeout: 5000 });
    
    // Verify it's a proper modal overlay
    await expect(warningModal).toHaveClass(/pdf-scanner-modal-overlay/);
    
    // Verify warning contains correct text for secrets
    const warningText = page.locator('.pdf-scanner-modal-message');
    await expect(warningText).toContainText('contains sensitive information');
    
    // Verify the file does not appear in the attachments (upload should be blocked)
    const attachment = page.locator('[data-testid="attachment"]');
    const attachmentVisible = await attachment.isVisible().catch(() => false);
    expect(attachmentVisible).toBe(false);
  });

  test('should show warning for PDF with extraction issues', async ({ page }) => {
    const uploadButton = page.locator('button[aria-label="upload file"]');
    await uploadButton.waitFor({ state: 'visible' });
    
    const fileInput = page.locator('input[type="file"]');
    const unreadablePdfPath = path.join(__dirname, 'fixtures', 'unreadable.pdf');
    
    await fileInput.setInputFiles(unreadablePdfPath);
    
    // Wait for processing
    await page.waitForTimeout(3000);
    
    // Check what indicators are shown - using correct IDs
    const warningModal = page.locator('#pdf-scanner-security-warning');
    const indicator = page.locator('#pdf-scanner-indicator');
    
    console.log('Checking indicators for unreadable PDF...');
    
    // Check visibility
    const warningVisible = await warningModal.isVisible().catch(() => false);
    const indicatorVisible = await indicator.isVisible().catch(() => false);
    
    // If indicator is visible, check what type it is
    let indicatorType: 'safe' | 'error' | 'scanning' | null = null;
    if (indicatorVisible) {
      const hasSuccessClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-success-bg'));
      const hasWarningClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-warning-bg'));
      const hasInfoClass = await indicator.evaluate(el => el.classList.contains('pdf-scanner-info-bg'));
      
      if (hasSuccessClass) indicatorType = 'safe';
      else if (hasWarningClass) indicatorType = 'error';
      else if (hasInfoClass) indicatorType = 'scanning';
    }
    
    console.log(`Warning modal visible: ${warningVisible}`);
    console.log(`Indicator visible: ${indicatorVisible}, type: ${indicatorType}`);
    
    // For an unreadable PDF, we should see EITHER:
    // 1. A warning modal (if it's a blocking warning), OR
    // 2. An error indicator (if it's a non-blocking warning)
    // We should NOT see BOTH a warning modal AND a safe indicator
    
    if (warningVisible && indicatorType === 'safe') {
      throw new Error('Both warning modal and safe indicator are visible for unreadable PDF - this indicates a bug where both success and warning states are shown simultaneously');
    }
    
    // At least one form of warning should be shown
    const hasAnyWarning = warningVisible || indicatorType === 'error';
    expect(hasAnyWarning).toBe(true);
    
    if (warningVisible) {
      // If modal warning is shown, verify it contains correct text for scan issues
      const warningText = page.locator('.pdf-scanner-modal-message');
      await expect(warningText).toContainText('Unable to properly scan');
      await expect(warningText).toContainText('verify that this file does not contain any sensitive information');
    } else if (indicatorType === 'error') {
      // If indicator warning is shown, verify it has the correct styling and message
      await expect(indicator).toHaveClass(/pdf-scanner-warning-bg/);
      const indicatorText = indicator.locator('div').nth(1); // Message is typically the second div
      await expect(indicatorText).toContainText(/Error scanning|Unable to scan/);
    }
    
    // Verify the file still appears in attachments (warning doesn't block upload for scan errors)
    const attachment = page.locator('[data-testid="attachment"]');
    await expect(attachment).toBeVisible();
    await expect(attachment).toContainText('unreadable.pdf');
  });
}); 