import { test as base, chromium, BrowserContext } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.join(__dirname, '../..');

function hookLogs(target: any) {
  target.on('console', (msg: any) => {
    console.log(`[${msg.type()}] ${msg.text()}`);
  });
  target.on('pageerror', (err: any) => {
    console.error('pageerror', err);
  });
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  reloadExt: () => Promise<void>;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
      ],
      headless: false,
    });

    // Hook up logging
    context.on('page', hookLogs);
    context.on('serviceworker', hookLogs);
    context.serviceWorkers().forEach(hookLogs);
    context.on('weberror', (err) => {
      throw new Error(`Unhandled error: ${err.error()}`);
    });

    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let extensionId: string | undefined;
    
    // Wait for the extension to be loaded
    const timeout = setTimeout(() => {
      throw new Error('Timeout waiting for extension to load');
    }, 30000);
    
    while (!extensionId) {
      const workers = context.serviceWorkers();
      const extensionWorker = workers.find(worker => 
        worker.url().includes('chrome-extension://')
      );
      
      if (extensionWorker) {
        extensionId = extensionWorker.url().split('/')[2];
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    clearTimeout(timeout);
    
    if (!extensionId) {
      throw new Error('Could not find extension ID');
    }
    
    // Create a page to initialize the extension
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/public/popup.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.close();
    
    await use(extensionId);
  },

  reloadExt: async ({ context }, use) => {
    await use(async () => {
      const workers = context.serviceWorkers();
      const extensionWorker = workers.find(worker => 
        worker.url().includes('chrome-extension://')
      );
      
      if (extensionWorker) {
        await extensionWorker.evaluate(() => {
          // @ts-ignore
          chrome.runtime.reload();
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    });
  },
});
