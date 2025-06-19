// Dependencies loaded via manifest.json script order

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSharedCSS);
} else {
  loadSharedCSS();
}

function initializePDFMonitor() {
  try {
    new PDFMonitor();
  } catch (error) {
    console.error('[PDF Scanner] Error creating PDF Monitor:', error);
    showStandaloneError('Error initializing PDF Scanner. Please refresh the page.');
  }
}

try {
  if (!chrome || !chrome.runtime) {
    showStandaloneError('PDF Scanner extension cannot access Chrome API. Please reload the page.');
  } else {
    chrome.runtime.sendMessage({ type: 'ping' }, () => {
      if (chrome.runtime.lastError) {
        showStandaloneError(
          'PDF Scanner extension not responding. Extension may need to be reloaded.'
        );
        console.error('[PDF Scanner] Extension context error:', chrome.runtime.lastError);
        return;
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePDFMonitor);
      } else if (document.readyState === 'interactive') {
        setTimeout(initializePDFMonitor, 100);
      } else {
        initializePDFMonitor();
      }
    });
  }
} catch (error) {
  console.error('[PDF Scanner] Error initializing PDF Monitor:', error);
  showStandaloneError('Error initializing PDF Scanner. Please refresh the page.');
}
