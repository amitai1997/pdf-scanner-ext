// Dependencies loaded via manifest.json script order

class PDFMonitor {
  constructor() {
    this.ui = new PDFMonitorUI(logger);
    this.interceptor = new PDFInterceptor(this.ui, this.sendMessage.bind(this));
    logger.log("PDF Monitor initializing");
    // Set global reference for standalone functions to access
    window.pdfMonitorInstance = this;
    this.init();
  }

  init() {
    try {
      logger.log('Initializing PDF Monitor');
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
      logger.log('Message listener set up');
      this.interceptor.startMonitoring();
      this.sendMessage({ type: 'content_loaded', url: window.location.href })
        .then(() => logger.log('Sent content_loaded message to background'))
        .catch((err) =>
          logger.error('Error sending content_loaded message', { error: err.message })
        );
      logger.log('PDF Monitor initialized');
      this.interceptor.setupDragAndDropMonitoring();
      this.interceptor.setupClipboardMonitoring();
      this.interceptor.monitorFileSelectionDialog();
    } catch (error) {
      logger.error('Error initializing PDF Monitor', { error: error.message });
    }
  }


  async sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        // Check if Chrome runtime is available and extension context is valid
        if (!chrome || !chrome.runtime) {
          const error = new Error('Extension context unavailable');
          logger.error('Chrome runtime not available');
          this.ui.showScanErrorIndicator(
            message.filename || 'File',
            'Extension context unavailable. Please refresh the page.'
          );
          return reject(error);
        }

        // Check if runtime.id is available (indicates valid context)
        if (!chrome.runtime.id) {
          const error = new Error('Extension context invalidated');
          logger.error('Extension context invalidated - runtime.id not available');
          this.ui.showScanErrorIndicator(
            message.filename || 'File',
            'Extension was reloaded. Please try again.'
          );
          return reject(error);
        }

        chrome.runtime.sendMessage(message, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            logger.error('Runtime error:', runtimeError.message);
            if (runtimeError.message.includes('context invalidated') || 
                runtimeError.message.includes('Extension context') ||
                runtimeError.message.includes('receiving end does not exist')) {
              this.ui.showScanErrorIndicator(
                message.filename || 'File',
                'Extension was reloaded. Please try again.'
              );
              console.error('[PDF Scanner] Extension context error:', runtimeError);
            }
            return reject(new Error(runtimeError.message));
          }
          if (!response) {
            return reject(new Error('No response received from background script'));
          }
          resolve(response);
        });
      } catch (error) {
        logger.error('Error in sendMessage:', error.message);
        if (
          error.message.includes('Extension context') ||
          error.message.includes('invalidated') ||
          error.message.includes('destroyed')
        ) {
          this.ui.showScanErrorIndicator(
            message.filename || 'File',
            'Extension was reloaded. Please try again.'
          );
          console.error('[PDF Scanner] Extension context error:', error);
        }
        reject(error);
      }
    });
  }


  handleMessage(message, sender, sendResponse) {
    try {
      logger.log('Received message', { type: message.type });
      switch (message.type) {
        case 'scan_result':
          this.handleScanResult(message);
          sendResponse({ success: true });
          break;
        case 'show_warning':
          this.ui.showSecretWarning(message.filename, message.result);
          sendResponse({ success: true });
          break;
        case 'show_error':
          this.ui.showScanErrorIndicator(message.filename, message.message);
          sendResponse({ success: true });
          break;
        case 'stop_monitoring':
          this.interceptor.stopMonitoring();
          sendResponse({ success: true });
          break;
        case 'start_monitoring':
          if (!this.interceptor.uploadState.monitoring) {
            this.interceptor.startMonitoring();
          }
          sendResponse({ success: true });
          break;
        case 'extension_reloaded':
          logger.log('Extension was reloaded, reinitializing');
          this.init();
          sendResponse({ success: true });
          break;
        default:
          logger.log('Unhandled message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      logger.error('Error handling message', { error: error.message });
      if (
        error.message.includes('Extension context') ||
        error.message.includes('invalidated') ||
        error.message.includes('destroyed')
      ) {
        showStandaloneError('PDF Scanner extension error. Please refresh the page.');
      }
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  handleScanResult(message) {
    try {
      const { requestId, result, filename } = message;
      logger.log('Received scan result', { requestId, filename, hasSecrets: result.secrets });
      if (result.secrets) {
        this.ui.showSecretWarning(filename, result);
      }
    } catch (error) {
      logger.error('Error handling scan result', { error: error.message });
    }
  }
}
