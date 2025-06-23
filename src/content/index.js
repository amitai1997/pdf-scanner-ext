// Dependencies loaded via manifest.json script order

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSharedCSS);
} else {
  loadSharedCSS();
}

function initializePDFMonitor() {
  try {
    // Double-check Chrome runtime is available before creating PDFMonitor
    if (!chrome || !chrome.runtime || !chrome.runtime.id) {
      throw new Error('Extension context not available');
    }
    new PDFMonitor();
  } catch (error) {
    console.error('[PDF Scanner] Error creating PDF Monitor:', error);
    showStandaloneError('Error initializing PDF Scanner. Please refresh the page.');
  }
}

function checkExtensionContext() {
  return new Promise((resolve, reject) => {
    try {
      if (!chrome || !chrome.runtime) {
        reject(new Error('Chrome runtime not available'));
        return;
      }

      // Check if extension context is valid by trying to access runtime.id
      if (!chrome.runtime.id) {
        reject(new Error('Extension context invalidated'));
        return;
      }

      // Send a ping to background to verify communication
      chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          if (error.message.includes('context invalidated') || 
              error.message.includes('receiving end does not exist')) {
            reject(new Error('Extension context invalidated'));
          } else {
            reject(new Error(error.message));
          }
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Initialize with better error handling
try {
  checkExtensionContext()
    .then(() => {
      logger.log('Extension context verified');
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePDFMonitor);
      } else if (document.readyState === 'interactive') {
        setTimeout(initializePDFMonitor, 100);
      } else {
        initializePDFMonitor();
      }
    })
    .catch((error) => {
      console.error('[PDF Scanner] Extension context error:', error);
      if (error.message.includes('context invalidated')) {
        showStandaloneError(
          'PDF Scanner extension was reloaded. Please refresh the page to continue.'
        );
      } else if (error.message.includes('not available')) {
        showStandaloneError('PDF Scanner extension cannot access Chrome API. Please reload the page.');
      } else {
        showStandaloneError(
          'PDF Scanner extension not responding. Extension may need to be reloaded.'
        );
      }
    });
} catch (error) {
  console.error('[PDF Scanner] Error initializing PDF Monitor:', error);
  showStandaloneError('Error initializing PDF Scanner. Please refresh the page.');
}
