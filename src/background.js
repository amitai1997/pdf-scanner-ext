// PDF Scanner Extension - Background Service Worker

// Create a logger for the background script
const logger = {
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

// Make logger available globally
self.logger = logger;

// Import utility scripts in the correct order
importScripts('./utils/formDataParser.js');
importScripts('./utils/interceptor.js');

// Access the interceptor from the global scope
const interceptor = self.interceptor;

logger.log('PDF Scanner service worker loaded');

class PDFScannerBackground {
  constructor() {
    // Environment detection
    this.isDevelopment = !chrome.runtime.id || 
                         chrome.runtime.id.includes('development') || 
                         chrome.runtime.getManifest().version.includes('0.');
    
    // URLs based on environment
    this.BACKEND_URL = this.isDevelopment 
      ? 'http://localhost:8080' 
      : 'https://api.your-production-backend.com';
    
    this.APP_ID = 'cc6a6cfc-9570-4e5a-b6ea-92d2adac90e4'; // From assignment
    this.API_URL = 'https://eu.prompt.security/api/protect';
    
    // In-memory queue for PDF scan requests
    this.scanQueue = new Map();
    
    // Debug mode for additional logging
    this.debugMode = this.isDevelopment;
    
    // Log environment
    logger.log(`Running in ${this.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
    logger.log(`Using backend URL: ${this.BACKEND_URL}`);
    
    this.init();
  }

  init() {
    // Log extension startup
    logger.log('PDF Scanner background initializing');
    
    // Debug info about the environment
    if (this.debugMode) {
      logger.log('Chrome API availability:', {
        webRequest: !!chrome.webRequest,
        storage: !!chrome.storage,
        runtime: !!chrome.runtime
      });
    }
    
    // Initialize the interceptor
    if (interceptor) {
      logger.log('Initializing request interceptor');
      interceptor.init();
    } else {
      logger.error('Interceptor not available');
    }
    
    this.bindEvents();
    logger.log('PDF Scanner background initialized');
    
    // Register additional web request listener directly in background
    this.registerAdditionalRequestListener();
  }
  
  /**
   * Register an additional web request listener as backup
   * Note: In Manifest V3, this is non-blocking
   */
  registerAdditionalRequestListener() {
    try {
      // Define URL patterns to monitor
      const urlPatterns = [
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
      
      logger.log('Registering additional web request listener for URLs:', urlPatterns);
      
      chrome.webRequest.onBeforeRequest.addListener(
        (details) => this.handleWebRequest(details),
        { 
          urls: urlPatterns,
          types: ['xmlhttprequest', 'other']
        },
        ['requestBody']
      );
      
      logger.log('Additional web request listener registered');
    } catch (error) {
      logger.error('Failed to register additional web request listener:', error);
    }
  }
  
  /**
   * Handle web request as a backup to the interceptor
   * Note: In Manifest V3, this cannot block requests
   * @param {Object} details - Request details
   */
  handleWebRequest(details) {
    try {
      // Skip non-POST requests
      if (details.method !== 'POST') {
        return;
      }
      
      logger.log('Background detected request:', details.url);
      
      // Check if the request has a body
      if (!details.requestBody) {
        return;
      }
      
      // Process the request (non-blocking)
      this.processWebRequest(details).catch(err => {
        logger.error('Error processing web request:', err);
      });
      
      // In Manifest V3, we cannot block requests with this listener
      // We rely on content scripts to detect uploads earlier
    } catch (error) {
      logger.error('Error in handleWebRequest:', error);
    }
  }
  
  /**
   * Process a web request to check for PDF content
   * @param {Object} details - Request details
   */
  async processWebRequest(details) {
    try {
      logger.log(`Processing request ${details.requestId} to ${details.url}`);
      
      // Check if request has raw data
      if (!details.requestBody.raw || details.requestBody.raw.length === 0) {
        return;
      }
      
      // Get the request body
      const rawData = details.requestBody.raw[0].bytes;
      
      // Convert to string for inspection
      const decoder = new TextDecoder('utf-8');
      let requestBody;
      try {
        requestBody = decoder.decode(rawData);
      } catch (e) {
        logger.error('Failed to decode request body:', e);
        return;
      }
      
      // Log request preview for debugging
      if (this.debugMode) {
        logger.log('Request body preview:', requestBody.substring(0, 100) + '...');
      }
      
      // Check for PDF content
      const isPDFRequest = this.checkForPDFContent(requestBody, details.url);
      
      if (isPDFRequest) {
        logger.log('Detected potential PDF upload in request');
        
        // Extract PDF data if possible
        try {
          // This is a simplified version - in a real implementation,
          // we would extract the PDF data from the request body
          // and send it for scanning
          
          // For now, we'll just create a notification
          this.showNotification({
            title: 'PDF Upload Detected',
            message: `Detected PDF upload to ${new URL(details.url).hostname}`
          });
        } catch (error) {
          logger.error('Error extracting PDF from request:', error);
        }
      }
    } catch (error) {
      logger.error('Error processing web request:', error);
    }
  }
  
  /**
   * Check if a request contains PDF content
   * @param {string} requestBody - Request body as string
   * @param {string} url - Request URL
   * @returns {boolean} - Whether the request likely contains PDF content
   */
  checkForPDFContent(requestBody, url) {
    try {
      // Check for common PDF indicators in the request body
      const pdfIndicators = [
        'application/pdf',
        'Content-Type: application/pdf',
        '.pdf',
        'filename=',
        '%PDF-'
      ];
      
      for (const indicator of pdfIndicators) {
        if (requestBody.includes(indicator)) {
          logger.log(`Found PDF indicator in request: ${indicator}`);
          return true;
        }
      }
      
      // Check for base64 encoded content
      if (requestBody.includes('base64')) {
        logger.log('Found base64 content in request, might be PDF');
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking for PDF content:', error);
      return false;
    }
  }

  bindEvents() {
    // Listen for messages from popup and content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Listen for keyboard shortcuts
    chrome.commands.onCommand.addListener((command) => {
      this.handleCommand(command);
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstalled(details);
    });
  }

  async handleMessage(message, sender, sendResponse) {
    logger.log('Background received message:', message.type);

    try {
      switch (message.type) {
        case 'scan': {
          // This is the immediate scan request from content script
          logger.log('Immediate scan request for:', message.filename);
          const result = await this.scanPDF(message);
          
          // If secrets found and we have a tab ID, show warning in that tab
          if (result.secrets && sender.tab && sender.tab.id) {
            this.showWarningInTab(sender.tab.id, message.filename, result);
          }
          
          sendResponse({ success: true, result });
          break;
        }
        
        case 'intercepted_pdf': {
          // Handle PDF intercepted by webRequest
          const result = await this.handleInterceptedPDF(message);
          sendResponse({ success: true, result });
          
          // If this came from a content script, notify it of the result
          if (sender.tab && sender.tab.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
              type: 'scan_result',
              requestId: message.requestId,
              filename: message.filename,
              result: result
            }).catch(err => {
              logger.error('Error sending scan result to content script', err);
            });
          }
          break;
        }
        
        case 'content_loaded': {
          // Content script has loaded on a page
          logger.log('Content script loaded on:', message.url);
          sendResponse({ success: true });
          break;
        }
        
        case 'pdf_selected': {
          // Content script detected PDF selection
          logger.log('PDF selected in content script:', message.filename);
          sendResponse({ success: true });
          break;
        }
        
        case 'pdf_detected_in_ui': {
          // Content script detected PDF in UI
          logger.log('PDF detected in UI:', message.details);
          sendResponse({ success: true });
          break;
        }

        case 'showNotification':
          await this.showNotification(message);
          sendResponse({ success: true });
          break;

        default:
          logger.warn('Unknown message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      logger.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleCommand(command) {
    logger.log('Command received:', command);

    switch (command) {
      case 'scan-selected-pdf':
        // For now, just log. In future versions, we could try to detect
        // PDF files in the current tab or show a file picker
        logger.log('Scan PDF shortcut triggered');
        await this.showNotification({
          title: 'PDF Scanner',
          message: 'Use the extension popup to select and scan PDF files.',
        });
        break;
    }
  }

  handleInstalled(details) {
    logger.log('Extension installed/updated:', details.reason);

    if (details.reason === 'install') {
      // Set default preferences
      chrome.storage.local.set({
        backendUrl: this.BACKEND_URL,
        notificationsEnabled: true,
        lastScanDate: null,
        debugMode: true
      });
    }
  }

  /**
   * Handle a PDF intercepted from webRequest
   * @param {Object} message - Message with PDF data
   * @returns {Object} - Scan result
   */
  async handleInterceptedPDF(message) {
    try {
      const { fileData, filename, fileSize, requestId } = message;
      
      logger.log(`Intercepted PDF: ${filename} (${fileSize} bytes), ID: ${requestId}`);
      
      if (this.debugMode) {
        logger.log('File data type:', typeof fileData);
        if (typeof fileData === 'string') {
          logger.log('File data preview:', fileData.substring(0, 50) + '...');
        }
      }
      
      // Add to scan queue
      this.scanQueue.set(requestId, {
        status: 'queued',
        timestamp: Date.now(),
        fileData,
        filename,
        fileSize
      });
      
      // Call scan function (same as used by popup)
      const result = await this.scanPDF({
        fileData,
        filename,
        fileSize
      });
      
      // Update queue status
      this.scanQueue.set(requestId, {
        status: 'completed',
        timestamp: Date.now(),
        result
      });
      
      // If secrets found, show notification
      if (result.secrets) {
        await this.showNotification({
          title: 'Security Alert',
          message: `Secrets detected in PDF: ${filename}`
        });
      }
      
      // Log the scan
      await this.logScanResult(filename, result);
      
      // Clean up queue after 5 minutes
      setTimeout(() => {
        this.scanQueue.delete(requestId);
      }, 5 * 60 * 1000);
      
      return result;
    } catch (error) {
      logger.error('Error handling intercepted PDF:', error);
      
      // Update queue with error
      if (message.requestId) {
        this.scanQueue.set(message.requestId, {
          status: 'error',
          timestamp: Date.now(),
          error: error.message
        });
      }
      
      throw error;
    }
  }

  async scanPDF(message) {
    const { fileData, filename, fileSize } = message;

    logger.log(`Scanning PDF: ${filename} (${fileSize} bytes)`);
    logger.log('File data type:', typeof fileData);

    try {
      // Convert data to blob based on format
      let blob;
      
      if (fileData.startsWith('data:')) {
        // It's a data URL
        logger.log('Processing data URL');
        const response = await fetch(fileData);
        blob = await response.blob();
      } else if (fileData.startsWith('blob:')) {
        // It's a blob URL
        logger.log('Processing blob URL');
        const response = await fetch(fileData);
        blob = await response.blob();
      } else if (typeof fileData === 'string' && fileData.startsWith('{')) {
        // It might be JSON string
        logger.log('Processing JSON string');
        try {
          const jsonData = JSON.parse(fileData);
          // Extract base64 data if present
          if (jsonData.data && typeof jsonData.data === 'string') {
            const base64Data = jsonData.data.replace(/^data:application\/pdf;base64,/, '');
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            blob = new Blob([bytes], { type: 'application/pdf' });
          } else {
            throw new Error('JSON data does not contain PDF data');
          }
        } catch (e) {
          logger.error('Failed to parse JSON data:', e);
          throw new Error('Invalid PDF data format');
        }
      } else {
        // Assume it's base64 data
        logger.log('Processing as base64 data');
        try {
          // Try to extract base64 part if it's a data URL
          const base64Data = fileData.replace(/^data:application\/pdf;base64,/, '');
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          blob = new Blob([bytes], { type: 'application/pdf' });
        } catch (e) {
          logger.error('Failed to convert base64 to blob:', e);
          throw new Error('Invalid PDF data format');
        }
      }

      // For Day 2, we'll use local mock backend
      // In production, this would call the real backend service
      const scanResult = await this.scanWithMockBackend(blob, filename);

      return scanResult;
    } catch (error) {
      logger.error('PDF scan error:', error);
      throw new Error(`Failed to scan PDF: ${error.message}`);
    }
  }

  // Day 2: Use local mock backend
  async scanWithMockBackend(blob, fileName) {
    logger.log('Scanning PDF with mock backend...');

    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Create form data
      const formData = new FormData();
      formData.append('pdf', blob, fileName);
      formData.append('filename', fileName);
      
      // Try to send to local backend (non-blocking)
      this.sendToLocalBackend(formData, fileName).catch(err => {
        logger.error('Error sending to local backend:', err);
      });
      
      // For Day 2, we'll continue to use simulation logic,
      // but with better heuristics
      
      // Check if filename contains test keywords to simulate different responses
      const hasSecrets =
        fileName.toLowerCase().includes('secret') ||
        fileName.toLowerCase().includes('aws') ||
        fileName.toLowerCase().includes('key') ||
        fileName.toLowerCase().includes('pass') ||
        fileName.toLowerCase().includes('token') ||
        fileName.toLowerCase().includes('auth');

      if (hasSecrets) {
        return {
          secrets: true,
          findings: [
            {
              type: 'AWS_ACCESS_KEY',
              confidence: 0.95,
              location: 'page 1, line 15',
            },
            {
              type: 'PASSWORD',
              confidence: 0.88,
              location: 'page 2, line 7',
            }
          ],
          action: 'block', // Updated to block instead of just log
          scannedAt: new Date().toISOString(),
        };
      } else {
        return {
          secrets: false,
          findings: [],
          action: 'allow',
          scannedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      logger.error('Mock backend scan failed:', error);
      throw error;
    }
  }
  
  /**
   * Attempt to send PDF to local backend for scanning
   * @param {FormData} formData - Form data with PDF
   * @param {string} fileName - PDF filename
   */
  async sendToLocalBackend(formData, fileName) {
    try {
      logger.log(`Sending ${fileName} to local backend at ${this.BACKEND_URL}/scan`);
      
      const response = await fetch(`${this.BACKEND_URL}/scan`, {
        method: 'POST',
        body: formData,
        headers: {
          'X-App-ID': this.APP_ID
        }
      });
      
      if (!response.ok) {
        throw new Error(`Backend responded with ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      logger.log('Local backend scan result:', result);
      
      return result;
    } catch (error) {
      logger.error('Local backend scan failed:', error);
      throw error;
    }
  }

  // Real implementation for future days
  async performRealScan(blob, fileName) {
    // This will be implemented in Day 3 with actual backend integration
    logger.log('Real scan implementation coming in Day 3...');

    // Convert blob to FormData for backend
    const formData = new FormData();
    formData.append('pdf', blob, fileName);

    try {
      const response = await fetch(`${this.BACKEND_URL}/scan`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Backend responded with ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      logger.error('Backend scan failed:', error);
      throw new Error(`Scan service unavailable: ${error.message}`);
    }
  }

  async showNotification(message) {
    const { title, message: body } = message;

    try {
      // Check if notifications are permitted
      const permission = await chrome.notifications.create({
        type: 'basic',
        // No custom icon, Chrome will use the extension's default icon
        title: title || 'PDF Scanner',
        message: body || 'Scan completed',
      });

      logger.log('Notification shown:', permission);

      // Auto-clear notification after 5 seconds
      setTimeout(() => {
        chrome.notifications.clear(permission);
      }, 5000);
    } catch (error) {
      logger.error('Failed to show notification:', error);
    }
  }

  // Utility method to log scan results (for observability)
  async logScanResult(fileName, result) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      fileName: fileName,
      secrets: result.secrets,
      findingsCount: result.findings?.length || 0,
      action: result.action,
    };

    logger.log('Scan result logged:', logEntry);

    // Store in local storage for debugging (will be sent to backend later)
    try {
      const { scanHistory = [] } = await chrome.storage.local.get('scanHistory');
      scanHistory.push(logEntry);

      // Keep only last 50 entries
      if (scanHistory.length > 50) {
        scanHistory.splice(0, scanHistory.length - 50);
      }

      await chrome.storage.local.set({ scanHistory });
    } catch (error) {
      logger.error('Failed to log scan result:', error);
    }
  }
  
  /**
   * Show warning in active tab when secrets are found
   * @param {number} tabId - Tab ID to show warning in
   * @param {string} filename - Name of file with secrets
   * @param {Object} result - Scan result
   */
  async showWarningInTab(tabId, filename, result) {
    try {
      logger.log(`Showing warning in tab ${tabId} for file ${filename}`);
      
      // Send message to content script to display warning
      await chrome.tabs.sendMessage(tabId, {
        type: 'show_warning',
        filename,
        result
      });
      
      // Also show a notification
      await this.showNotification({
        title: '⚠️ Security Alert',
        message: `Secrets detected in PDF: ${filename}. Upload blocked.`
      });
      
    } catch (error) {
      logger.error('Error showing warning in tab:', error);
      
      // Fallback to notification if content script messaging fails
      await this.showNotification({
        title: '⚠️ Security Alert',
        message: `Secrets detected in PDF: ${filename}. Please check the file before uploading.`
      });
    }
  }
}

// Initialize background service worker
new PDFScannerBackground();
