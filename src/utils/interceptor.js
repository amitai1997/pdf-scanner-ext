// PDF Scanner Extension - Request Interceptor Service

// Create a simple logger if not already available
if (!self.logger) {
  self.logger = {
    log(message, data) {
      try {
        if (data !== undefined) {
          console.log(`[PDF Scanner] ${message}`, data);
        } else {
          console.log(`[PDF Scanner] ${message}`);
        }
      } catch (e) {
        // Silent fail if console is not available
      }
    },
    
    warn(message, data) {
      try {
        if (data !== undefined) {
          console.warn(`[PDF Scanner] WARNING: ${message}`, data);
        } else {
          console.warn(`[PDF Scanner] WARNING: ${message}`);
        }
      } catch (e) {
        // Silent fail if console is not available
      }
    },
    
    error(message, data) {
      try {
        if (data !== undefined) {
          console.error(`[PDF Scanner] ERROR: ${message}`, data);
        } else {
          console.error(`[PDF Scanner] ERROR: ${message}`);
        }
      } catch (e) {
        // Silent fail if console is not available
      }
    }
  };
}

// We'll use FormDataParser directly from self when needed
// No importScripts here to avoid circular dependencies

/**
 * Handles intercepting web requests to detect and scan PDF uploads
 */
class RequestInterceptor {
  constructor() {
    this.PDF_MIME_TYPES = [
      'application/pdf',
      'application/x-pdf',
      'application/acrobat',
      'application/vnd.pdf',
    ];
    this.MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB
    this.pendingRequests = new Map(); // Track in-flight requests
    this.urlPatterns = [
      '*://chat.openai.com/backend-api/*',
      '*://chat.openai.com/api/*',
      '*://chat.openai.com/v1/*',
      '*://chatgpt.com/backend-api/*',
      '*://chatgpt.com/api/*',
      '*://chatgpt.com/v1/*',
      '*://*.openai.com/v1/*',
      '*://claude.ai/api/*',
      '*://claude.ai/chat/*',
      '*://*.anthropic.com/*'
    ];
  }

  /**
   * Initialize the request interceptor
   */
  init() {
    try {
      // Only register content script listeners
      this.registerContentScriptListeners();
      self.logger.log('Request interceptor initialized (content script only)');
    } catch (error) {
      self.logger.error('Failed to initialize request interceptor:', error);
    }
  }

  /**
   * Register listeners for content script messages
   */
  registerContentScriptListeners() {
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'pdf_selected') {
          self.logger.log('Content script detected PDF selection:', message.filename);
          // We'll get the actual PDF data when it's uploaded via webRequest
          sendResponse({ success: true });
        }
      });
      
      self.logger.log('Content script listeners registered');
    } catch (error) {
      self.logger.error('Failed to register content script listeners:', error);
    }
  }

  /**
   * Queue PDF for scanning
   * @param {string} requestId - Request ID
   * @param {Object} pdfData - PDF data object
   */
  queuePDFForScanning(requestId, pdfData) {
    try {
      // Add to pending requests
      this.pendingRequests.set(requestId, {
        pdfData,
        status: 'queued',
        timestamp: Date.now()
      });
      
      self.logger.log(`Queued PDF for scanning: ${pdfData.filename} (${pdfData.size} bytes)`);
      
      // Convert blob to data URL for sending
      const reader = new FileReader();
      reader.onload = () => {
        const base64data = reader.result;
        
        // Send message to background script for scanning
        chrome.runtime.sendMessage({
          type: 'intercepted_pdf',
          requestId,
          filename: pdfData.filename,
          fileSize: pdfData.size,
          fileData: base64data
        }, (response) => {
          if (chrome.runtime.lastError) {
            self.logger.error('Error sending PDF to background:', chrome.runtime.lastError);
          } else {
            self.logger.log('PDF sent to background for scanning, response:', response);
          }
        });
      };
      
      reader.onerror = (error) => {
        self.logger.error('Error reading PDF blob:', error);
      };
      
      // Start reading the blob as data URL
      reader.readAsDataURL(pdfData.blob);
    } catch (error) {
      self.logger.error('Error queueing PDF for scanning:', error);
    }
  }
  
  /**
   * Update pending request with scan result
   * @param {string} requestId - Request ID
   * @param {Object} scanResult - Scan result
   */
  updateRequestWithScanResult(requestId, scanResult) {
    try {
      if (this.pendingRequests.has(requestId)) {
        const request = this.pendingRequests.get(requestId);
        request.scanResult = scanResult;
        request.status = 'scanned';
        
        self.logger.log(`Updated request ${requestId} with scan result`);
        
        // Clean up after 5 minutes
        setTimeout(() => {
          this.pendingRequests.delete(requestId);
        }, 5 * 60 * 1000);
      }
    } catch (error) {
      self.logger.error('Error updating request with scan result:', error);
    }
  }

  /**
   * Get information about a pending request
   * @param {string} requestId - Request ID
   * @returns {Object|null} - Request info or null if not found
   */
  getRequestInfo(requestId) {
    return this.pendingRequests.get(requestId) || null;
  }
}

// Create the interceptor instance only if it doesn't exist yet
if (!self.interceptor) {
  self.interceptor = new RequestInterceptor();
}