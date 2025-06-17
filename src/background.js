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
      ? 'http://localhost:3001' 
      : 'https://api.your-production-backend.com';
    
    this.APP_ID = 'cc6a6cfc-9570-4e5a-b6ea-92d2adac90e4'; // From assignment
    this.API_URL = 'https://eu.prompt.security/api/protect';
    
    // In-memory queue for PDF scan requests
    this.scanQueue = new Map();
    
    // Debug mode for additional logging
    this.debugMode = this.isDevelopment;
    
    // Scan statistics
    this.scanStats = {
      scanCount: 0,
      lastScan: null,
      isActive: true,
      scanHistory: []
    };
    
    // Log environment
    logger.log(`Running in ${this.isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION'} mode`);
    logger.log(`Using backend URL: ${this.BACKEND_URL}`);
    
    this.processedRequestIds = new Set();
    this.processedFileHashes = new Set();
    this.scansInFlight       = new Map();

    chrome.alarms.create('clearHashCache', { periodInMinutes: 24 * 60 });
    chrome.alarms.onAlarm.addListener(a => {
      if (a.name === 'clearHashCache') this.processedFileHashes.clear();
    });
    
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
    
    // Load scan stats from storage
    this.loadScanStats();
    
    // Set up daily counter reset alarm
    this.setupDailyCounterReset();
    
    this.bindEvents();
    logger.log('PDF Scanner background initialized');
    
    // Register additional web request listener directly in background
    this.registerAdditionalRequestListener();
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
      // ── Request‑level deduplication ──
      // Skip if we've already processed this requestId
      if (this.processedRequestIds.has(details.requestId)) {
        return;          // ignore duplicate onBeforeRequest events
      }
      this.processedRequestIds.add(details.requestId);

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
      const fileHash = await this._computeHash(fileData);
      logger.log(`Scanning file: ${filename}, hash: ${fileHash}, base64 length: ${fileData.length}`);
      if (fileSize === 0 && this.processedFileHashes.has(fileHash)) {
        // We use the cache **only** to suppress the duplicate empty payload
        logger.log('Duplicate empty upload skipped for hash:', fileHash);
        return;
      }
      this.processedFileHashes.add(fileHash);
      
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
    // ── single‑shot execution guard ──
    if (this.scansInFlight.has(filename)) {
      logger.log('Scan already in flight, awaiting result for:', filename);
      return await this.scansInFlight.get(filename);
    }

    let _resolveScan, _rejectScan;
    const scanPromise = new Promise((res, rej) => { _resolveScan = res; _rejectScan = rej; });
    this.scansInFlight.set(filename, scanPromise);

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

      // For Day 3, we'll use the real backend service
      try {
        const formData   = this.createFormData(blob, filename);
        const res = await this.sendToLocalBackend(formData, filename);
        _resolveScan(res);
        return res;
      } catch (error) {
        logger.error('Backend scan failed – aborting scan:', error);
        _resolveScan(error);
        throw error;                       // ⇦ bubble up
      }
    } catch (error) {
      logger.error('PDF scan error:', error);
      if (_rejectScan) _rejectScan(error);
      throw new Error(`Failed to scan PDF: ${error.message}`);
    }
    finally {
      this.scansInFlight.delete(filename);
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
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'X-App-ID': this.APP_ID,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Backend responded with ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      logger.log('Local backend scan result:', result);
      
      // Map findings to ensure they have all needed properties
      if (result.findings && Array.isArray(result.findings)) {
        // Keep the full findings data from the API instead of mapping/transforming it
        // This ensures all details like entity_type, category, and value are preserved
        // We'll handle display formatting in the content script
      }
      
      return {
        secrets: result.secrets || false,
        findings: result.findings || [],
        action: result.action || 'allow',
        scannedAt: result.scannedAt || new Date().toISOString(),
      };
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
      const notificationId = await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon.png', // Correct path for Chrome extension
        title: title || 'PDF Scanner',
        message: body || 'Scan completed',
      });

      logger.log('Notification shown:', notificationId);

      // Auto-clear notification after 5 seconds
      setTimeout(() => {
        chrome.notifications.clear(notificationId);
      }, 5000);
    } catch (error) {
      logger.error('Failed to show notification:', error);
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
    formData.append('filename', filename);
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
      // Extract PDF from the request body using FormDataParser
      let pdfData = null;
      if (details.requestBody && details.requestBody.raw && details.requestBody.raw.length > 0) {
        const buffer = details.requestBody.raw[0].bytes;
        // Try to extract PDF from multipart or JSON
        pdfData = FormDataParser.extractPDFFromMultipart(buffer, details) ||
                  FormDataParser.extractPDFFromJSON(buffer);
      }
      if (!pdfData) {
        logger.log('No PDF found in intercepted web request');
        return;
      }
      logger.log(`PDF extracted from web request: ${pdfData.filename} (${pdfData.size} bytes)`);
      // Send the PDF for scanning (reuse handleInterceptedPDF logic)
      await this.handleInterceptedPDF({
        fileData: await this._blobToDataUrl(pdfData.blob),
        filename: pdfData.filename,
        fileSize: pdfData.size,
        requestId: details.requestId || `webreq-${Date.now()}`
      });
    } catch (error) {
      logger.error('Error in processWebRequest:', error);
    }
  }

  /**
   * Helper to convert Blob to data URL
   */
  async _blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Compute SHA-256 hash of a base64 string
   */
  async _computeHash(base64String) {
    if (typeof base64String !== 'string' || !base64String) {
      logger.warn('Cannot compute hash for invalid input.');
      // Return SHA-256 of empty string for invalid input
      return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    }
    // Remove data URL prefix if present
    let base64 = base64String.split(',')[1] || base64String;

    // ----- Robust base-64 normalisation & decoding -----
    let normalised = base64
      .replace(/^data:[^,]*,/, '')      // strip any data-URL header
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .trim();

    try {
      // Decode %xx escapes if present
      normalised = decodeURIComponent(normalised);
    } catch (_) { /* not URI-encoded – ignore */ }

    // Keep only legal base-64 chars
    normalised = normalised.replace(/[^A-Za-z0-9+/=]/g, '');

    // Pad to multiple of 4
    while (normalised.length % 4) {
      normalised += '=';
    }

    let binaryString;
    try {
      binaryString = atob(normalised);
    } catch (e) {
      logger.warn('atob failed; hashing raw text instead', e);
      // Hash the cleaned text itself (deterministic fallback)
      const fallbackBytes = new TextEncoder().encode(normalised);
      const hashBuffer = await crypto.subtle.digest('SHA-256', fallbackBytes);
      return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// Initialize background service worker
new PDFScannerBackground();
