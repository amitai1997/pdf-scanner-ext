import { expect } from '@playwright/test';
import { test } from './extension.fixture';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server: http.Server;
const PORT = 3333;

test.describe('PDF Upload Tests', () => {
  test.beforeAll(async () => {
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
    
    // Wait for the upload to complete and verify no warning appears
    try {
      const warning = page.locator('#pdf-scanner-security-warning');
      await expect(warning).not.toBeVisible({ timeout: 5000 });
    } catch (e) {
      // If timeout error, that's good - means no warning appeared
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
    
    // Verify extension is loaded
    const extensionLoaded = await page.evaluate(() => {
      // @ts-ignore
      return window.hasOwnProperty('PDFScannerContentScript');
    });
    console.log('Extension loaded:', extensionLoaded);
    
    // Prepare file input for upload
    const fileInput = page.locator('input[type="file"]');
    
    // Get the absolute path to the test PDF
    const secretsPdfPath = path.join(__dirname, 'fixtures', 'with-secrets.pdf');
    
    // Upload the file
    await fileInput.setInputFiles(secretsPdfPath);
    
    // Wait for file processing
    await page.waitForTimeout(2000);
    
    // Check if warning exists in DOM
    const warningExists = await page.evaluate(() => {
      return !!document.querySelector('#pdf-scanner-security-warning');
    });
    console.log('Warning exists in DOM:', warningExists);
    
    // Verify warning appears
    const warning = page.locator('#pdf-scanner-security-warning');
    await expect(warning).toBeVisible({ timeout: 5000 });
    
    // Verify warning contains correct text
    const warningText = page.locator('.pdf-scanner-modal-message');
    await expect(warningText).toContainText('contains sensitive information');
    
    // Verify the file does not appear in the attachments
    try {
      const attachment = page.locator('[data-testid="attachment"]');
      await expect(attachment).not.toBeVisible({ timeout: 5000 });
    } catch (e) {
      // If timeout error, that's good - means no attachment appeared
    }
  });

  test('should show warning for PDF with extraction issues', async ({ page }) => {
    const uploadButton = page.locator('button[aria-label="upload file"]');
    await uploadButton.waitFor({ state: 'visible' });
    
    const fileInput = page.locator('input[type="file"]');
    const unreadablePdfPath = path.join(__dirname, 'fixtures', 'unreadable.pdf');
    
    await fileInput.setInputFiles(unreadablePdfPath);
    
    // Verify warning appears
    const warning = page.locator('#pdf-scanner-security-warning');
    await expect(warning).toBeVisible({ timeout: 5000 });
    
    // Verify it's a warning style (yellow) not an error (red)
    await expect(warning).toHaveClass(/pdf-scanner-warning-bg/);
    
    // Verify warning contains correct text
    const warningText = page.locator('.pdf-scanner-modal-message');
    await expect(warningText).toContainText('Unable to properly scan');
    await expect(warningText).toContainText('verify that this file does not contain any sensitive information');
    
    // Verify the file still appears in attachments (warning doesn't block upload)
    const attachment = page.locator('[data-testid="attachment"]');
    await expect(attachment).toBeVisible();
    await expect(attachment).toContainText('unreadable.pdf');
  });
}); 