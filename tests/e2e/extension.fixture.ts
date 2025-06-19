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
    });

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
    const [sw] = context.serviceWorkers();
    const id = sw.url().split('/')[2];
    await use(id);
  },

  reloadExt: async ({ context }, use) => {
    await use(async () => {
      const [sw] = context.serviceWorkers();
      await sw.evaluate(() => chrome.runtime.reload());
      await context.waitForEvent('serviceworker');
    });
  },
});
