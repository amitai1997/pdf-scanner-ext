// Dependencies loaded via manifest.json script order

class PDFMonitor {
  constructor() {
    this.fileInputs = new Set();
    this.uploadState = {
      monitoring: true,
      pendingScans: new Map(),
      activeUploads: new Set(),
    };
    this.debugMode = true;
    this._inputChangeListeners = new Map();
    this._formSubmitListeners = new Map();
    this._buttonClickListeners = new Map();
    this._currentEscHandler = null;
    this.ui = new PDFMonitorUI(logger);
    logger.log('PDF Monitor initializing');
    this.init();
  }

  init() {
    try {
      logger.log('Initializing PDF Monitor');
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
      logger.log('Message listener set up');
      this.startMonitoring();
      this.sendMessage({ type: 'content_loaded', url: window.location.href })
        .then(() => logger.log('Sent content_loaded message to background'))
        .catch((err) =>
          logger.error('Error sending content_loaded message', { error: err.message })
        );
      logger.log('PDF Monitor initialized');
      this.setupDragAndDropMonitoring();
      this.setupClipboardMonitoring();
      this.monitorFileSelectionDialog();
      this.monitorXHRAndFetch();
    } catch (error) {
      logger.error('Error initializing PDF Monitor', { error: error.message });
    }
  }

  monitorXHRAndFetch() {
    monitorXHRAndFetch();
  }

  async sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome || !chrome.runtime) {
          return reject(new Error('Extension context unavailable'));
        }
        chrome.runtime.sendMessage(message, (response) => {
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            if (runtimeError.message.includes('context invalidated')) {
              this.ui.showScanErrorIndicator(
                message.filename || 'File',
                'Extension was reloaded. Please try again.'
              );
              console.error(
                '[PDF Scanner] Extension context invalidated. The extension may have been reloaded.'
              );
              return reject(new Error('Extension context invalidated'));
            }
            return reject(runtimeError);
          }
          if (!response) {
            return reject(new Error('No response received from background script'));
          }
          resolve(response);
        });
      } catch (error) {
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

  async scanPDFImmediately(file) {
    try {
      logger.log(`=== IMMEDIATE SCAN START ===`);
      logger.log(`Scanning PDF immediately: ${file.name} (${file.size} bytes)`);
      logger.log('File details:', {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        webkitRelativePath: file.webkitRelativePath || 'N/A',
      });
      const fileData = await this.readFileAsDataURL(file);
      logger.log(
        `File data read, sending to background. Data length: ${fileData ? fileData.length : 0}`
      );
      const response = await this.sendMessage({
        type: 'scan',
        filename: file.name,
        fileSize: file.size,
        fileData,
      });
      if (!response || !response.success) {
        throw new Error(response?.error || 'Unknown error scanning PDF');
      }
      logger.log(`=== IMMEDIATE SCAN COMPLETE ===`);
      return response.result;
    } catch (error) {
      logger.error('Error scanning PDF immediately:', error);
      if (
        error.message.includes('Scanning service temporarily unavailable') ||
        error.message.includes('Scanning service unavailable')
      ) {
        this.ui.showScanErrorIndicator(
          file.name,
          'Security scanning service is temporarily unavailable. Please try uploading again in a moment.'
        );
      } else if (
        error.message.includes('Extension context') ||
        error.message.includes('invalidated') ||
        error.message.includes('unavailable')
      ) {
        this.ui.showScanErrorIndicator(
          file.name,
          'Extension was reloaded or is unavailable. Please refresh the page and try again.'
        );
      } else {
        this.ui.showScanErrorIndicator(file.name, `Scan error: ${error.message}`);
      }
      throw error;
    }
  }

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      logger.log(
        `Reading file: ${file.name}, size: ${file.size}, type: ${file.type}, lastModified: ${file.lastModified}`
      );
      reader.onload = () => {
        const result = reader.result;
        const dataSize = result ? result.length : 0;
        logger.log(`File read complete: ${file.name}, data size: ${dataSize}`);
        if (result && typeof result === 'string') {
          const preview = result.substring(0, 100);
          logger.log(`File data preview: ${preview}...`);
        }
        resolve(result);
      };
      reader.onerror = () => {
        logger.error(`Failed to read file: ${file.name}`);
        reject(new Error('Failed to read file'));
      };
      reader.readAsDataURL(file);
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
        case 'stop_monitoring':
          this.stopMonitoring();
          sendResponse({ success: true });
          break;
        case 'start_monitoring':
          if (!this.uploadState.monitoring) {
            this.startMonitoring();
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

// Assign watcher functions to PDFMonitor prototype
PDFMonitor.prototype.startMonitoring = startMonitoring;
PDFMonitor.prototype.checkForChatGPTFileElements = checkForChatGPTFileElements;
PDFMonitor.prototype.addWarningIndicatorToAttachment = addWarningIndicatorToAttachment;
PDFMonitor.prototype.setupDragAndDropMonitoring = setupDragAndDropMonitoring;
PDFMonitor.prototype.setupClipboardMonitoring = setupClipboardMonitoring;
PDFMonitor.prototype.monitorFileSelectionDialog = monitorFileSelectionDialog;
PDFMonitor.prototype.stopMonitoring = stopMonitoring;
PDFMonitor.prototype.scanForFileInputs = scanForFileInputs;
PDFMonitor.prototype.setupFormSubmissionMonitoring = setupFormSubmissionMonitoring;
PDFMonitor.prototype.handleFileInputChange = handleFileInputChange;
PDFMonitor.prototype.handleFormSubmit = handleFormSubmit;
PDFMonitor.prototype.handleButtonClick = handleButtonClick;
PDFMonitor.prototype.trackUpload = trackUpload;

// Assign other utility functions
// Assign watcher functions to PDFMonitor prototype
PDFMonitor.prototype.startMonitoring = startMonitoring;
PDFMonitor.prototype.checkForChatGPTFileElements = checkForChatGPTFileElements;
PDFMonitor.prototype.addWarningIndicatorToAttachment = addWarningIndicatorToAttachment;
PDFMonitor.prototype.setupDragAndDropMonitoring = setupDragAndDropMonitoring;
PDFMonitor.prototype.setupClipboardMonitoring = setupClipboardMonitoring;
PDFMonitor.prototype.monitorFileSelectionDialog = monitorFileSelectionDialog;
PDFMonitor.prototype.stopMonitoring = stopMonitoring;
PDFMonitor.prototype.scanForFileInputs = scanForFileInputs;
PDFMonitor.prototype.setupFormSubmissionMonitoring = setupFormSubmissionMonitoring;
PDFMonitor.prototype.handleFileInputChange = handleFileInputChange;
PDFMonitor.prototype.handleFormSubmit = handleFormSubmit;
PDFMonitor.prototype.handleButtonClick = handleButtonClick;
PDFMonitor.prototype.trackUpload = trackUpload;

// Assign other utility functions
PDFMonitor.prototype.monitorXHRAndFetch = monitorXHRAndFetch;
PDFMonitor.checkIfBodyContainsPDF = checkIfBodyContainsPDF;
PDFMonitor._checkIfBodyContainsPDFShared = _checkIfBodyContainsPDFShared;
PDFMonitor._isPdfCandidate = _isPdfCandidate;
PDFMonitor.extractPDFFromBody = extractPDFFromBody;
