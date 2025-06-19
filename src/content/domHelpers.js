import { logger } from './logger.js';

export function loadSharedCSS() {
  try {
    if (!document || !document.head) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSharedCSS);
        return;
      }
      if (!document.head && document.body) {
        console.warn('[PDF Scanner] document.head not available, using body');
        loadSharedCSSToBody();
        return;
      }
      console.warn('[PDF Scanner] Cannot load shared CSS - DOM not ready');
      return;
    }
    if (document.getElementById('pdf-scanner-shared-css')) {
      return;
    }
    const link = document.createElement('link');
    link.id = 'pdf-scanner-shared-css';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('public/styles/shared-themes.css');
    document.head.appendChild(link);
  } catch (error) {
    console.warn('[PDF Scanner] Error loading shared CSS:', error);
  }
}

export function loadSharedCSSToBody() {
  try {
    if (!document.body || document.getElementById('pdf-scanner-shared-css')) {
      return;
    }
    const link = document.createElement('link');
    link.id = 'pdf-scanner-shared-css';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('public/styles/shared-themes.css');
    document.body.appendChild(link);
  } catch (error) {
    console.warn('[PDF Scanner] Error loading shared CSS to body:', error);
  }
}

export function removeExistingIndicators() {
  try {
    const existingIndicator = document.getElementById('pdf-scanner-indicator');
    if (existingIndicator) {
      existingIndicator.remove();
    }
  } catch (error) {
    logger.error('Error removing existing indicators:', error);
  }
}

export function removeExistingSecurityWarnings() {
  try {
    const existingWarning = document.getElementById('pdf-scanner-security-warning');
    if (existingWarning) {
      existingWarning.remove();
    }
    const possibleWarnings = document.querySelectorAll('div[style*="z-index: 10000"]');
    possibleWarnings.forEach((el) => {
      if (el.innerHTML.includes('Security Risk Detected')) {
        el.remove();
      }
    });
  } catch (error) {
    logger.error('Error removing existing security warnings:', error);
  }
}
