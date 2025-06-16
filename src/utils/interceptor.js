// PDF Scanner Extension - Request Interceptor Service

import { FormDataParser } from './formDataParser.js';
import logger from './logger.js';

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
      // ChatGPT API endpoints (cover all possibilities)
      '*://chat.openai.com/backend-api/*',
      '*://chat.openai.com/api/*',
      '*://chat.openai.com/v1/*',
      '*://chatgpt.com/backend-api/*',
      '*://chatgpt.com/api/*',
      '*://chatgpt.com/v1/*',
      // OpenAI API endpoints
      '*://*.openai.com/v1/*',
      // Claude API endpoints
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
      // Log initialization
      self.logger.log('Initializing request interceptor with URL patterns:', this.urlPatterns);
      
      // Listen for requests matching our patterns
      chrome.webRequest.onBeforeRequest.addListener(
        this.handleBeforeRequest.bind(this),
        {
          urls: this.urlPatterns,
          types: ['xmlhttprequest', 'other', 'main_frame', 'sub_frame']
        },
        ['requestBody']
      );

      // Also register content script listeners
      this.registerContentScriptListeners();

      self.logger.log('Request interceptor initialized successfully');
      
      // Test if webRequest is working
      self.logger.log('WebRequest API available:', !!chrome.webRequest);
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
   * Handle the webRequest.onBeforeRequest event
   * @param {Object} details - Request details
   * @returns {void} - Processing is async, non-blocking
   */
  handleBeforeRequest(details) {
    try {
      self.logger.log('Intercepted request:', details.url);
      
      // Only process POST requests with form data
      if (details.method !== 'POST') {
        self.logger.log('Skipping non-POST request');
        return;
      }
      
      if (!details.requestBody) {
        self.logger.log('Skipping request without body');
        return;
      }

      self.logger.log(`Processing request ${details.requestId} to ${details.url}`);
      
      // Process request asynchronously (non-blocking)
      this.processRequest(details).catch(err => {
        self.logger.error(`Error processing request ${details.requestId}:`, err);
      });
    } catch (error) {
      self.logger.error('Error in handleBeforeRequest:', error);
    }
  }

  /**
   * Process an intercepted request asynchronously
   * @param {Object} details - Request details
   */
  async processRequest(details) {
    try {
      // Extract request body as ArrayBuffer
      if (!details.requestBody.raw || details.requestBody.raw.length === 0) {
        return;
      }

      const buffer = details.requestBody.raw[0].bytes;
      
      // Check if request has PDF data
      const pdfData = await this.extractPDFFromRequest(details, buffer);
      
      if (!pdfData) {
        self.logger.log('No PDF found in request');
        return;
      }
      
      self.logger.log(`Found PDF in request, size: ${pdfData.size} bytes`);
      
      // Add to queue for scanning
      this.queuePDFForScanning(details.requestId, pdfData);
      
    } catch (error) {
      self.logger.error('Failed to process request:', error);
    }
  }

  /**
   * Extract PDF data from request body
   * @param {Object} details - Request details
   * @param {ArrayBuffer} buffer - Request body as ArrayBuffer
   * @returns {Object|null} - PDF data object or null if no PDF found
   */
  async extractPDFFromRequest(details, buffer) {
    try {
      self.logger.log('Extracting PDF from request body');
      
      // Convert ArrayBuffer to string for processing
      const decoder = new TextDecoder('utf-8');
      const requestBody = decoder.decode(buffer);
      
      // Log the first 100 chars of the request body for debugging
      self.logger.log('Request body preview:', requestBody.substring(0, 100));
      
      // First try to extract from multipart form data
      const multipartResult = this.extractPDFFromMultipart(requestBody, details);
      if (multipartResult) {
        self.logger.log('Found PDF in multipart form data');
        return multipartResult;
      }
      
      // Then try JSON
      if (requestBody.startsWith('{')) {
        self.logger.log('Trying to extract PDF from JSON payload');
        const jsonResult = this.extractPDFFromJSON(requestBody);
        if (jsonResult) {
          self.logger.log('Found PDF in JSON payload');
          return jsonResult;
        }
      }
      
      self.logger.log('No PDF found in request body');
      return null;
    } catch (error) {
      self.logger.error('Error extracting PDF from request:', error);
      return null;
    }
  }

  /**
   * Extract PDF data from multipart/form-data
   * @param {string} requestBody - Request body string
   * @param {Object} details - Request details
   * @returns {Object|null} - PDF data or null
   */
  extractPDFFromMultipart(requestBody, details) {
    try {
      self.logger.log('Attempting to extract PDF from multipart data');
      
      // Try to find boundary in the request body
      const boundaryMatch = requestBody.match(/boundary=(?:"([^"]+)"|([^;\r\n]+))/i);
      let boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';
      
      if (!boundary) {
        // Try to find boundary in the content itself
        const firstLine = requestBody.split('\r\n')[0];
        if (firstLine.startsWith('--')) {
          boundary = firstLine.substring(2);
        }
      }
      
      if (!boundary) {
        self.logger.warn('No boundary found in multipart request');
        return null;
      }
      
      self.logger.log('Found boundary:', boundary);
      
      // Split by boundary
      const parts = requestBody.split(`--${boundary}`);
      self.logger.log(`Found ${parts.length} parts in multipart request`);
      
      // Look for PDF parts
      for (const part of parts) {
        // Check if this part contains PDF content type
        const isPDF = this.PDF_MIME_TYPES.some(type => part.includes(`Content-Type: ${type}`));
        
        if (!isPDF) {
          // Also check for filename with .pdf extension
          const filenameMatch = part.match(/filename="([^"]*\.pdf)"/i);
          if (!filenameMatch) {
            continue;
          }
        }
        
        self.logger.log('Found part with PDF content');
        
        // Extract PDF content
        const bodyStartIndex = part.indexOf('\r\n\r\n');
        if (bodyStartIndex === -1) continue;
        
        const headers = part.substring(0, bodyStartIndex);
        const body = part.substring(bodyStartIndex + 4);
        
        // Get filename from content-disposition
        const filenameMatch = headers.match(/filename="([^"]*)"/i);
        const filename = filenameMatch ? filenameMatch[1] : 'unknown.pdf';
        
        self.logger.log(`Extracted PDF with filename: ${filename}`);
        
        // Create Blob from PDF data
        const pdfBlob = new Blob([body], { type: 'application/pdf' });
        
        // Check size constraints
        if (pdfBlob.size > this.MAX_PDF_SIZE) {
          self.logger.warn(`PDF too large: ${pdfBlob.size} bytes`);
          return null;
        }
        
        return {
          filename,
          size: pdfBlob.size,
          blob: pdfBlob,
          timestamp: new Date().toISOString()
        };
      }
      
      return null;
    } catch (error) {
      self.logger.error('Error parsing multipart form data:', error);
      return null;
    }
  }

  /**
   * Extract PDF data from JSON payload (handles base64 encoded PDFs)
   * @param {string} requestBody - Request body as string
   * @returns {Object|null} - PDF data or null
   */
  extractPDFFromJSON(requestBody) {
    try {
      const data = JSON.parse(requestBody);
      
      // Look for base64 encoded PDF in attachments or similar fields
      // This is platform-specific and will need to be expanded based on API analysis
      const findBase64PDF = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        
        for (const [key, value] of Object.entries(obj)) {
          // Check if it looks like a file attachment field
          if (typeof value === 'string' && 
             (key.includes('file') || key.includes('attachment') || key.includes('document'))) {
            
            // Check if it's likely a base64 PDF
            if (value.startsWith('data:application/pdf;base64,')) {
              // Extract and decode
              const base64Data = value.replace(/^data:application\/pdf;base64,/, '');
              
              // Create blob
              const binary = atob(base64Data);
              const array = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                array[i] = binary.charCodeAt(i);
              }
              
              const blob = new Blob([array], {type: 'application/pdf'});
              
              // Check size
              if (blob.size > this.MAX_PDF_SIZE) {
                self.logger.warn(`Base64 PDF too large: ${blob.size} bytes`);
                return null;
              }
              
              // Extract filename if available, otherwise use generic name
              let filename = 'document.pdf';
              if (obj.filename || obj.name) {
                filename = obj.filename || obj.name;
                if (!filename.toLowerCase().endsWith('.pdf')) {
                  filename += '.pdf';
                }
              }
              
              return {
                filename,
                size: blob.size,
                blob,
                timestamp: new Date().toISOString()
              };
            }
          } else if (typeof value === 'object') {
            // Recursively search for PDF data
            const result = findBase64PDF(value);
            if (result) return result;
          }
        }
        
        return null;
      };
      
      return findBase64PDF(data);
    } catch (error) {
      self.logger.error('Error parsing JSON request body:', error);
      return null;
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

// Create the interceptor instance
const interceptor = new RequestInterceptor();

// Export for ES modules
export { interceptor };

// Make available in service worker context
if (typeof self !== 'undefined') {
  self.interceptor = interceptor;
}

// Export for CommonJS modules if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { interceptor };
}