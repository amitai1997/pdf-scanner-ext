/**
 * Chrome service worker that queues scans, tracks stats,
 * and relays messages between scripts.
 */

// Load shared utilities
importScripts('./shared/constants.js', './utils/formDataParser.js', './shared/pdfDetection.js', './shared/logger.js');

// Use the shared extension logger
defineLogger();

function defineLogger() {
  // Use the global extensionLogger if available, otherwise fallback to console
  const logger = self.extensionLogger || console;
  self.logger = logger;
}

logger.log('PDF Scanner service worker loaded');

class PDFScannerBackground {
  constructor() {
    // Configuration for local backend service
    this.APP_ID = 'cc6a6cfc-9570-4e5a-b6ea-92d2adac90e4';
    this.API_URL = 'http://localhost:3001/scan';
    this.scanQueue = new Map();
    this.scanStats = {
      scanCount: 0,
      lastScan: null,
      isActive: true,
      scanHistory: []
    };
    this.processedRequestIds = new Set();
    chrome.alarms.create('clearRequestIds', { periodInMinutes: 60 });
    chrome.alarms.onAlarm.addListener(a => {
      if (a.name === 'clearRequestIds') {
        this.processedRequestIds.clear();
      }
    });
    this.init();
  }

  init() {
    this.loadScanStats();
    this.setupDailyCounterReset();
    this.bindEvents();
  }
  
  // Save scan statistics to chrome.storage
  async saveScanStats() {
    try {
      await chrome.storage.local.set({ 
        scanStats: {
          scanCount: this.scanStats.scanCount,
          lastScan: this.scanStats.lastScan,
          date: new Date().toDateString()
        } 
      });
      logger.log('Scan stats saved to storage', this.scanStats);
    } catch (error) {
      logger.error('Error saving scan stats to storage', error);
    }
  }
  
  // Load scan statistics from chrome.storage
  async loadScanStats() {
    try {
      const data = await chrome.storage.local.get('scanStats');
      if (data.scanStats) {
        const today = new Date().toDateString();
        
        // If the stored date is today, use the stored count
        // Otherwise, reset the count (it's a new day)
        if (data.scanStats.date === today) {
          this.scanStats.scanCount = data.scanStats.scanCount;
          this.scanStats.lastScan = data.scanStats.lastScan;
        } else {
          this.scanStats.scanCount = 0;
          this.scanStats.lastScan = null;
          // Save the reset count
          this.saveScanStats();
        }
        
        logger.log('Scan stats loaded from storage', this.scanStats);
      }
    } catch (error) {
      logger.error('Error loading scan stats from storage', error);
    }
  }
  
  // Setup daily counter reset
  setupDailyCounterReset() {
    try {
      // Create an alarm to reset the counter at midnight
      chrome.alarms.create('resetDailyCounter', {
        // Fire at midnight
        when: this.getNextMidnight(),
        periodInMinutes: 24 * 60 // Once every 24 hours
      });
      
      // Add listener for the alarm
      chrome.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === 'resetDailyCounter') {
          this.scanStats.scanCount = 0;
          this.saveScanStats();
          logger.log('Daily scan counter reset');
        }
      });
      
      logger.log('Daily counter reset alarm scheduled');
    } catch (error) {
      logger.error('Error setting up daily counter reset', error);
    }
  }
  
  // Get timestamp for next midnight
  getNextMidnight() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }

  /**
   * Register event listeners for the background script
   */
  bindEvents() {
    try {
      // Listen for messages from content scripts or popup
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        // Return true to indicate we want to send a response asynchronously
        return true;
      });
      
      // Handle browser commands (keyboard shortcuts)
      chrome.commands.onCommand.addListener((command) => {
        this.handleCommand(command);
      });
      
      // Handle extension installation/update
      chrome.runtime.onInstalled.addListener((details) => {
        this.handleInstalled(details);
      });
      
      logger.log('Background event listeners registered');
    } catch (error) {
      logger.error('Error binding event listeners:', error);
    }
  }
  
  /**
   * Handle messages sent from content scripts and popup
   * @param {Object} message - Message object
   * @param {Object} sender - Sender information 
   * @param {Function} sendResponse - Function to send response
   */
  async handleMessage(message, sender, sendResponse) {
    try {
      logger.log('Background received message:', message.type);
      
      switch (message.type) {
        case 'ping': {
          // Simple ping to check if extension is responsive
          logger.log('Ping received from content script');
          sendResponse({ success: true, message: 'pong' });
          break;
        }
        
        case 'scan': {
          logger.log('Immediate scan request for:', message.filename);
          const result = await this.scanPDF(message);

          // ── Decide whether we must alert the user ──
          const incidentDetected = result.secrets === true;

          if (incidentDetected && sender.tab && sender.tab.id) {
            this.showWarningInTab(sender.tab.id, message.filename, result);
          }

          sendResponse({ success: true, result });
          break;
        }
        
        case 'content_loaded': {
          // Content script has loaded in a tab
          logger.log('Content script loaded in tab:', sender.tab ? sender.tab.id : 'unknown');
          sendResponse({ success: true });
          break;
        }
        
        case 'pdf_selected': {
          // PDF file was selected by user
          logger.log('PDF selected in tab:', sender.tab ? sender.tab.id : 'unknown');
          sendResponse({ success: true });
          break;
        }
        
        case 'intercepted_pdf': {
          // PDF was intercepted (form upload, XHR, etc.)
          logger.log('PDF intercepted:', message.filename);
          this.handleInterceptedPDF(message).catch(err => {
            logger.error('Error handling intercepted PDF:', err);
          });
          sendResponse({ success: true });
          break;
        }
        
        case 'GET_SCAN_STATS': {
          // Popup is requesting scan statistics
          logger.log('Popup requested scan statistics');
          sendResponse({ 
            success: true, 
            scanCount: this.scanStats.scanCount,
            lastScan: this.scanStats.lastScan,
            isActive: this.scanStats.isActive
          });
          break;
        }
        
        case 'TOGGLE_ACTIVE_STATE': {
          // Toggle the active state
          this.scanStats.isActive = !this.scanStats.isActive;
          logger.log(`Scanner ${this.scanStats.isActive ? 'activated' : 'deactivated'}`);
          sendResponse({ 
            success: true, 
            isActive: this.scanStats.isActive 
          });
          break;
        }
        
        default:
          // Unhandled message type
          logger.warn('Unhandled message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
          break;
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
      // ── Zero‑byte guard ──
      if (fileSize === 0) {
        logger.warn('[PDF Scanner] Skipping 0‑byte upload:', filename);
        return;               // do not hash, do not scan
      }
      
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
        fileSize,
        uniqueId: `${requestId}_${Date.now()}` // Add unique ID to ensure independent scans
      });
      
      // Update queue status
      this.scanQueue.set(requestId, {
        status: 'completed',
        timestamp: Date.now(),
        result
      });
      
      // Note: Intercepted scans are for background monitoring only
      // Tab warnings are only shown for immediate user-initiated scans
      // This prevents duplicate warnings from showing
      
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
    const { fileData, filename, fileSize, uniqueId } = message;
    const scanId = uniqueId || `${filename}_${Date.now()}_${fileSize}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.log(`Starting independent scan for: ${filename} (ID: ${scanId})`);
    
    try {
      let blob;
      if (fileData.startsWith('data:')) {
        const response = await fetch(fileData);
        blob = await response.blob();
      } else if (fileData.startsWith('blob:')) {
        const response = await fetch(fileData);
        blob = await response.blob();
      } else if (typeof fileData === 'string' && fileData.startsWith('{')) {
        try {
          const jsonData = JSON.parse(fileData);
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
        } catch {
          throw new Error('Invalid PDF data format');
        }
      } else {
        try {
          const base64Data = fileData.replace(/^data:application\/pdf;base64,/, '');
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          blob = new Blob([bytes], { type: 'application/pdf' });
        } catch {
          throw new Error('Invalid PDF data format');
        }
      }
      
      const formData = this.createFormData(blob, filename);
      logger.log(`Sending scan request for: ${filename} (ID: ${scanId})`);
      
      const response = await fetch(this.API_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'X-App-ID': this.APP_ID
        }
      });
      
      if (!response.ok) {
        // Check if it's a service unavailability error
        if (response.status === 503) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Scanning service temporarily unavailable: ${errorData.message || 'Please try again in a moment'}`);
        }
        throw new Error(`API responded with ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Check if the result indicates a scan error
      if (result.error === 'scan_service_unavailable') {
        throw new Error(`Scanning service unavailable: ${result.message}`);
      }
      
      logger.log(`Scan completed for: ${filename} (ID: ${scanId}), secrets: ${result.secrets}`);
      
      return result;
    } catch (error) {
      logger.error(`Scan failed for: ${filename} (ID: ${scanId}):`, error.message);
      throw new Error(`Failed to scan PDF: ${error.message}`);
    }
  }

  async showNotification(message) {
    if (!message || typeof message !== 'object') {
      logger.error('Invalid notification message:', message);
      return;
    }

    const { title, message: body } = message;
    const notificationTitle = title || 'PDF Scanner';
    const notificationMessage = body || 'Scan completed';

    try {
      // Create notification options with all required fields
      const notificationOptions = {
        type: 'basic',
        title: String(notificationTitle),
        message: String(notificationMessage),
        iconUrl: chrome.runtime.getURL('public/icons/icon16.png') // Use the valid icon file
      };

      logger.log('Creating notification with options:', JSON.stringify(notificationOptions));
      logger.log('Options type check - type:', typeof notificationOptions.type, 'title:', typeof notificationOptions.title, 'message:', typeof notificationOptions.message);

      try {
        const notificationId = await chrome.notifications.create(notificationOptions);
        
        logger.log('Notification shown:', notificationId);

        // Auto-clear notification after 5 seconds
        setTimeout(() => {
          chrome.notifications.clear(notificationId);
        }, 5000);
      } catch (createError) {
        logger.error('Error creating notification:', createError);
        
        if (chrome.runtime.lastError) {
          logger.error('Chrome runtime error:', JSON.stringify(chrome.runtime.lastError));
          logger.error('Error message:', chrome.runtime.lastError.message);
        }
      }
    } catch (error) {
      logger.error('Failed to show notification:', error);
      
      // Check for runtime.lastError
      if (chrome.runtime.lastError) {
        logger.error('Chrome runtime error:', JSON.stringify(chrome.runtime.lastError));
        logger.error('Error message:', chrome.runtime.lastError.message);
      }
    }
  }

  // Utility method to log scan results (for observability)
  /**
   * Helper to create form data for the backend
   * @param {Blob} blob - PDF blob
   * @param {string} filename - PDF filename
   * @returns {FormData} Form data for backend request
   */
  createFormData(blob, filename) {
    const formData = new FormData();
    formData.append('pdf', blob, filename);
    return formData;
  }
  
  async logScanResult(fileName, result) {
    try {
      // Update scan count and save to storage
      this.scanStats.scanCount++;
      this.scanStats.lastScan = new Date().toISOString();
      
      // Save scan stats to storage
      this.saveScanStats();
      
      // Existing scan history logic
      this.scanStats.scanHistory.push({
        timestamp: Date.now(),
        fileName,
        result: result
      });
      
      // Only keep the last 50 scan results in memory
      if (this.scanStats.scanHistory.length > 50) {
        this.scanStats.scanHistory.shift();
      }
      
      logger.log('Scan stats updated:', {
        scanCount: this.scanStats.scanCount,
        lastScan: this.scanStats.lastScan
      });
  
    } catch (error) {
      logger.error('Error logging scan result:', error);
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

  /**
   * Process a web request intercepted by the backup listener
   * @param {Object} details - Request details
   */
  async processWebRequest(details) {
    try {
      logger.log('Processing intercepted web request', details.url);
      // Extract PDF from the request using the high-level API
      const pdfData = await extractPDFFromRequest(details);
      
      if (!pdfData) {
        logger.log('No PDF found in intercepted web request');
        return;
      }
      
      logger.log(`PDF extracted from web request: ${pdfData.filename} (${pdfData.size} bytes)`);
      
      // Send the PDF for scanning (reuse handleInterceptedPDF logic)
      await this.handleInterceptedPDF({
        fileData: pdfData.data,
        filename: pdfData.filename,
        fileSize: pdfData.size,
        requestId: details.requestId || `webreq-${Date.now()}`
      });
    } catch (error) {
      logger.error('Error in processWebRequest:', error);
    }
  }



}

// Initialize background service worker
new PDFScannerBackground();
