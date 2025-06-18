#!/usr/bin/env node

/**
 * Chrome Extension Log Monitor
 * Connects to Chrome DevTools to capture extension console logs
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function monitorExtensionLogs() {
  console.log('🔍 Starting Chrome Extension Log Monitor...');
  
  // Connect to existing Chrome instance or launch new one
  let browser;
  try {
    // Try to connect to existing Chrome with debugging enabled
    browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null
    });
    console.log('✅ Connected to existing Chrome instance');
  } catch (error) {
    console.log('⚠️  No existing Chrome found, launching new instance...');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--remote-debugging-port=9222',
        '--load-extension=/Users/amitaisalmon/Documents/pdf-scanner-ext',
        '--disable-extensions-except=/Users/amitaisalmon/Documents/pdf-scanner-ext',
        '--no-first-run',
        '--disable-default-apps'
      ]
    });
  }

  const pages = await browser.pages();
  let extensionPage = null;

  // Find extension background page
  for (const page of pages) {
    const url = page.url();
    if (url.includes('chrome-extension://') && url.includes('background')) {
      extensionPage = page;
      break;
    }
  }

  if (!extensionPage) {
    console.log('📄 Creating new page to monitor...');
    extensionPage = await browser.newPage();
    await extensionPage.goto('chrome://extensions/');
  }

  // Monitor console logs
  extensionPage.on('console', msg => {
    const text = msg.text();
    if (text.includes('[PDF Scanner]')) {
      const timestamp = new Date().toISOString();
      const logEntry = `${timestamp} ${text}`;
      console.log(`🔍 Extension: ${logEntry}`);
      
      // Append to log file
      fs.appendFileSync('extension-logs.txt', logEntry + '\n');
    }
  });

  console.log('👀 Monitoring extension logs... Press Ctrl+C to stop');
  console.log('📝 Logs will be saved to extension-logs.txt');
  
  // Keep monitoring
  process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping monitor...');
    await browser.close();
    process.exit(0);
  });

  // Keep the script running
  setInterval(() => {}, 1000);
}

// Check if puppeteer is available
try {
  monitorExtensionLogs().catch(console.error);
} catch (error) {
  console.log('❌ Puppeteer not available. Install with: npm install puppeteer');
  console.log('📋 Manual monitoring: Open Chrome DevTools → Console → Filter "[PDF Scanner]"');
} 