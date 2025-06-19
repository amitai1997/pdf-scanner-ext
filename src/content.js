// PDF Scanner Extension - Content Script
// This runs in the context of AI chat websites to monitor for PDF uploads

/**
 * Load shared CSS for consistent styling with DOM ready check
 */
function loadSharedCSS() {
  try {
    // Check if DOM is ready and head exists
    if (!document || !document.head) {
      // If DOM isn't ready, wait for it
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSharedCSS);
        return;
      }
      // Still no head? Try body as fallback
      if (!document.head && document.body) {
        console.warn('[PDF Scanner] document.head not available, using body');
        loadSharedCSSToBody();
        return;
      }
      console.warn('[PDF Scanner] Cannot load shared CSS - DOM not ready');
      return;
    }

    // Check if already loaded
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
    // Continue without CSS - extension should still work
  }
}

/**
 * Fallback: Load CSS to body if head isn't available
 */
function loadSharedCSSToBody() {
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

// Load shared CSS with proper timing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSharedCSS);
} else {
  loadSharedCSS();
}

// Create a logger with shared utilities integration
const logger = (() => {
  // Fallback logger implementation 
  const fallbackLogger = {
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
    },
    
    info(message, data) { this.log(message, data); },
    debug(message, data) { this.log(message, data); }
  };

  // Try to use shared logger approach if available
  try {
    // For now, use the fallback but with improved formatting
    return {
      log: fallbackLogger.log,
      info: fallbackLogger.info,
      warn: fallbackLogger.warn,
      error: fallbackLogger.error,
      debug: fallbackLogger.debug
    };
  } catch (e) {
    return fallbackLogger;
  }
})();

// Import shared constants - with fallbacks for safety
let PDF_CONSTANTS, UI_CONSTANTS;
try {
  // Note: Dynamic import since content scripts have module loading limitations
  PDF_CONSTANTS = {
    MAX_PDF_SIZE: 20 * 1024 * 1024, // 20MB
    SCAN_TIMEOUT: 10000, // 10 seconds
    NOTIFICATION_DURATION: 5000, // 5 seconds
    PDF_MIME_TYPES: [
      'application/pdf',
      'application/x-pdf',
      'application/acrobat',
      'application/vnd.pdf',
    ]
  };
  
  UI_CONSTANTS = {
    Z_INDEX: {
      WARNING_MODAL: 10000,
      INDICATOR: 9999,
      ATTACHMENT_WARNING: 1000,
    },
    COLORS: {
      ERROR: '#d32f2f',
      WARNING: '#ffc107',
      SUCCESS: '#4caf50',
      INFO: '#2196f3',
      GRAY: '#f8f9fa',
      TEXT: '#333',
    }
  };
} catch (e) {
  // Fallback constants if shared import fails
  PDF_CONSTANTS = {
    MAX_PDF_SIZE: 20 * 1024 * 1024,
    SCAN_TIMEOUT: 10000,
    NOTIFICATION_DURATION: 5000,
    PDF_MIME_TYPES: ['application/pdf', 'application/x-pdf', 'application/acrobat', 'application/vnd.pdf']
  };
  UI_CONSTANTS = {
    Z_INDEX: { WARNING_MODAL: 10000, INDICATOR: 9999, ATTACHMENT_WARNING: 1000 },
    COLORS: { ERROR: '#d32f2f', WARNING: '#ffc107', SUCCESS: '#4caf50', INFO: '#2196f3', GRAY: '#f8f9fa', TEXT: '#333' }
  };
}

// Legacy constants for backward compatibility
const SCAN_TIMEOUT = PDF_CONSTANTS.SCAN_TIMEOUT;
const NOTIFICATION_DURATION = PDF_CONSTANTS.NOTIFICATION_DURATION;
const MAX_PDF_SIZE = PDF_CONSTANTS.MAX_PDF_SIZE;

// Log that content script has loaded
logger.log(`Content script loaded on ${window.location.href}`);
console.log('[PDF Scanner] Content script loaded');

/**
 * Class to monitor the page for PDF file uploads and coordinate with service worker
 */
class PDFMonitor {
  constructor() {
    this.fileInputs = new Set();
    this.uploadState = {
      monitoring: true,
      pendingScans: new Map(),
      activeUploads: new Set()
    };
    
    // Debug mode
    this.debugMode = true;
    
    // Event listener references for cleanup
    this._inputChangeListeners = new Map();
    this._formSubmitListeners = new Map();
    this._buttonClickListeners = new Map();
    this._currentEscHandler = null; // Store the current Escape key handler
    
    logger.log('PDF Monitor initializing');
    this.init();
  }
  
  /**
   * Initialize the monitor
   */
  init() {
    try {
      logger.log('Initializing PDF Monitor');
      
      // Set up message listener first
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
      logger.log('Message listener set up');
      
      // Start monitoring for file inputs
      this.startMonitoring();
      
      // Notify background that content script is active
      this.sendMessage({
        type: 'content_loaded',
        url: window.location.href
      }).then(() => {
        logger.log('Sent content_loaded message to background');
      }).catch(err => {
        logger.error('Error sending content_loaded message', { error: err.message });
      });
      
      logger.log('PDF Monitor initialized');
      
      // Monitor for drag and drop events
      this.setupDragAndDropMonitoring();
      
      // Monitor for clipboard paste events
      this.setupClipboardMonitoring();
      
      // Monitor for file selection dialog
      this.monitorFileSelectionDialog();
      
      // Monitor for XHR/fetch requests
      this.monitorXHRAndFetch();
    } catch (error) {
      logger.error('Error initializing PDF Monitor', { error: error.message });
    }
  }
  
  /**
   * Monitor XHR and fetch requests to catch PDF uploads
   * This is important for Manifest V3 where we can't block requests
   */
  monitorXHRAndFetch() {
    try {
      // Monitor XMLHttpRequest
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._pdfScannerMethod = method;
        this._pdfScannerUrl = url;
        return originalXHROpen.apply(this, [method, url, ...args]);
      };
      
      XMLHttpRequest.prototype.send = function(body) {
        // Only monitor POST requests that might contain PDFs
        if (this._pdfScannerMethod === 'POST' && body) {
          try {
            const isPDF = PDFMonitor.checkIfBodyContainsPDF(body);
            if (isPDF) {
              logger.log('Detected PDF in XHR request to:', this._pdfScannerUrl);
              // Extract the PDF data if possible
              PDFMonitor.extractPDFFromBody(body).then(pdfData => {
                if (pdfData) {
                  chrome.runtime.sendMessage({
                    type: 'intercepted_pdf',
                    requestId: `xhr-${Date.now()}`,
                    filename: pdfData.filename || 'document.pdf',
                    fileSize: pdfData.size,
                    fileData: pdfData.data
                  });
                }
              }).catch(err => {
                logger.error('Error extracting PDF from XHR:', err);
              });
            }
          } catch (e) {
            logger.error('Error in XHR send override:', e);
          }
        }
        return originalXHRSend.apply(this, arguments);
      };
      
      // Monitor fetch
      const originalFetch = window.fetch;
      window.fetch = function(resource, init) {
        // Check if this might be a PDF upload
        if (init && init.method === 'POST' && init.body) {
          try {
            const isPDF = PDFMonitor.checkIfBodyContainsPDF(init.body);
            if (isPDF) {
              logger.log('Detected PDF in fetch request to:', resource);
              // Extract the PDF data if possible
              PDFMonitor.extractPDFFromBody(init.body).then(pdfData => {
                if (pdfData) {
                  chrome.runtime.sendMessage({
                    type: 'intercepted_pdf',
                    requestId: `fetch-${Date.now()}`,
                    filename: pdfData.filename || 'document.pdf',
                    fileSize: pdfData.size,
                    fileData: pdfData.data
                  });
                }
              }).catch(err => {
                logger.error('Error extracting PDF from fetch:', err);
              });
            }
          } catch (e) {
            logger.error('Error in fetch override:', e);
          }
        }
        return originalFetch.apply(this, arguments);
      };
      
      logger.log('XHR and fetch monitoring set up');
    } catch (error) {
      logger.error('Error setting up XHR/fetch monitoring:', error);
    }
  }
  
  /**
   * Static method to check if a request body contains a PDF
   * Uses shared PDF detection logic with fallback
   * @param {any} body - Request body
   * @returns {boolean} - Whether the body likely contains a PDF
   */
  static checkIfBodyContainsPDF(body) {
    try {
      // Try shared detection logic first
      return PDFMonitor._checkIfBodyContainsPDFShared(body);
    } catch (e) {
      logger.error('Error checking if body contains PDF:', e);
      return false;
    }
  }

  /**
   * Shared PDF detection logic (consolidated from shared utilities)
   * @param {any} body - Request body
   * @returns {boolean} - Whether the body likely contains a PDF
   */
  static _checkIfBodyContainsPDFShared(body) {
    // Handle different body types
    if (!body) return false;
    
    // If it's a string, check for PDF indicators
    if (typeof body === 'string') {
      return body.includes('application/pdf') || 
             body.includes('.pdf') || 
             body.includes('%PDF-') ||
             body.includes('data:application/pdf');
    }
    
    // If it's FormData, check its entries
    if (body instanceof FormData) {
      let hasPDF = false;
      body.forEach((value, key) => {
        if (PDFMonitor._isPdfCandidate(value)) {
          hasPDF = true;
        }
      });
      return hasPDF;
    }
    
    // If it's a Blob or File, check directly
    if (body instanceof Blob || body instanceof File) {
      return PDFMonitor._isPdfCandidate(body);
    }
    
    return false;
  }

  /**
   * Check if a file is a PDF candidate (shared logic)
   * @param {File|Blob|Object} file - File object or file-like object
   * @returns {boolean} - Whether the file is likely a PDF
   */
  static _isPdfCandidate(file) {
    if (!file) return false;
    
    // Check MIME type
    if (file.type && PDF_CONSTANTS.PDF_MIME_TYPES.includes(file.type)) {
      return true;
    }
    
    // Check file extension
    if (file.name && file.name.toLowerCase().endsWith('.pdf')) {
      return true;
    }
    
    // Check for filename patterns in objects
    if (typeof file === 'object' && !file.type && !file.name) {
      const filename = file.filename || file.originalname;
      if (filename && filename.toLowerCase().endsWith('.pdf')) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Static method to extract PDF data from a request body
   * @param {any} body - Request body
   * @returns {Promise<Object|null>} - PDF data or null
   */
  static async extractPDFFromBody(body) {
    try {
      // Handle different body types
      if (!body) return null;
      
      // If it's FormData, try to extract PDF file
      if (body instanceof FormData) {
        let pdfFile = null;
        body.forEach((value, key) => {
          if (value instanceof File && 
             (value.type === 'application/pdf' || value.name.endsWith('.pdf'))) {
            pdfFile = value;
          }
        });
        
        if (pdfFile) {
          const reader = new FileReader();
          return new Promise((resolve, reject) => {
            reader.onload = () => {
              resolve({
                filename: pdfFile.name,
                size: pdfFile.size,
                data: reader.result
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(pdfFile);
          });
        }
      }
      
      // If it's a Blob or File that's a PDF
      if ((body instanceof Blob && body.type === 'application/pdf') ||
          (body instanceof File && (body.type === 'application/pdf' || body.name.endsWith('.pdf')))) {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
          reader.onload = () => {
            resolve({
              filename: body instanceof File ? body.name : 'document.pdf',
              size: body.size,
              data: reader.result
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(body);
        });
      }
      
      // For string bodies, it's more complex and depends on format
      // This is a simplified version that just checks for base64 PDFs
      if (typeof body === 'string' && body.includes('data:application/pdf;base64,')) {
        const match = body.match(/data:application\/pdf;base64,([^"'\s]+)/);
        if (match && match[1]) {
          const base64Data = match[1];
          // Estimate size (rough approximation)
          const size = Math.floor(base64Data.length * 0.75);
          return {
            filename: 'document.pdf',
            size: size,
            data: `data:application/pdf;base64,${base64Data}`
          };
        }
      }
      
      return null;
    } catch (e) {
      logger.error('Error extracting PDF from body:', e);
      return null;
    }
  }
  
  /**
   * Start monitoring the page for file inputs
   */
  startMonitoring() {
    try {
      // Initial scan for existing file inputs
      this.scanForFileInputs();
      
      // Set up mutation observer to detect dynamically added file inputs
      this.observer = new MutationObserver(mutations => {
        let shouldRescan = false;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length) {
            shouldRescan = true;
            break;
          }
        }
        
        if (shouldRescan) {
          this.scanForFileInputs();
          
          // Also check for ChatGPT-specific elements
          this.checkForChatGPTFileElements();
        }
      });
      
      // Start observing
      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // Monitor form submissions
      this.setupFormSubmissionMonitoring();
      
      // Check for ChatGPT-specific elements
      this.checkForChatGPTFileElements();
      
      logger.log('Started monitoring for file inputs');
    } catch (error) {
      logger.error('Error starting monitoring', { error: error.message });
    }
  }
  
  /**
   * Check for ChatGPT-specific file upload elements
   */
  checkForChatGPTFileElements() {
    try {
      // ChatGPT has a specific file upload button
      const fileButtons = document.querySelectorAll('button[aria-label*="upload"], button[aria-label*="attach"], button[aria-label*="file"]');
      
      fileButtons.forEach(button => {
        if (!button._pdfScannerMonitored) {
          button._pdfScannerMonitored = true;
          button.addEventListener('click', () => {
            logger.log('ChatGPT file upload button clicked');
            // The actual file input will be detected by our other monitoring
            
            // Find any hidden file inputs that might be triggered by this button
            // This is a common pattern in modern web apps
            const nearbyFileInputs = document.querySelectorAll('input[type="file"]');
            nearbyFileInputs.forEach(input => {
              if (!input._pdfScannerClickMonitored) {
                input._pdfScannerClickMonitored = true;
                
                // Create a MutationObserver to detect when files are added to this input
                const observer = new MutationObserver(mutations => {
                  if (input.files && input.files.length > 0) {
                    logger.log('Files added to input via ChatGPT UI');
                    // Manually trigger our handler
                    this.handleFileInputChange({ target: input });
                  }
                });
                
                // Observe the input for changes
                observer.observe(input, {
                  attributes: true,
                  attributeFilter: ['files']
                });
                
                logger.log('Added mutation observer to file input');
              }
            });
          });
        }
      });
      
      // Look for file attachments already in the UI
      const attachmentElements = document.querySelectorAll('[data-testid*="attachment"], [class*="attachment"], [class*="file-attachment"]');
      
      attachmentElements.forEach(element => {
        if (!element._pdfScannerMonitored) {
          element._pdfScannerMonitored = true;
          
          // Check if this looks like a PDF
          const isPDF = 
            element.textContent?.toLowerCase().includes('.pdf') ||
            element.getAttribute('aria-label')?.toLowerCase().includes('pdf') ||
            element.querySelector('img[alt*="PDF" i]');
          
          if (isPDF) {
            logger.log('Found PDF attachment in UI', {
              text: element.textContent,
              ariaLabel: element.getAttribute('aria-label')
            });
            
            // Report to background script
            this.sendMessage({
              type: 'pdf_detected_in_ui',
              details: {
                text: element.textContent,
                ariaLabel: element.getAttribute('aria-label')
              }
            }).catch(err => {
              logger.error('Error reporting PDF in UI', err);
            });
            
            // Add a warning indicator to the attachment element
            this.addWarningIndicatorToAttachment(element);
          }
        }
      });
      
      // Special handling for ChatGPT's file picker dialog
      // Look for the dialog that appears when selecting files
      const filePickers = document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
      filePickers.forEach(dialog => {
        if (!dialog._pdfScannerMonitored && 
            (dialog.textContent?.includes('Upload') || 
             dialog.textContent?.includes('File') || 
             dialog.textContent?.includes('Attach'))) {
          
          dialog._pdfScannerMonitored = true;
          logger.log('Found ChatGPT file picker dialog');
          
          // Find any file inputs inside the dialog
          const fileInputs = dialog.querySelectorAll('input[type="file"]');
          fileInputs.forEach(input => {
            if (!this.fileInputs.has(input)) {
              this.fileInputs.add(input);
              input.addEventListener('change', this.handleFileInputChange.bind(this));
              logger.log('Added event listener to file input in dialog');
            }
          });
          
          // Monitor for new file inputs being added to the dialog
          const dialogObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
              if (mutation.type === 'childList' && mutation.addedNodes.length) {
                // Check if any of the added nodes are file inputs or contain file inputs
                for (const node of mutation.addedNodes) {
                  if (node.nodeType === Node.ELEMENT_NODE) {
                    const newInputs = node.querySelectorAll ? 
                      node.querySelectorAll('input[type="file"]') : [];
                    
                    if (newInputs.length > 0) {
                      logger.log('New file inputs added to dialog');
                      newInputs.forEach(input => {
                        if (!this.fileInputs.has(input)) {
                          this.fileInputs.add(input);
                          input.addEventListener('change', this.handleFileInputChange.bind(this));
                          logger.log('Added event listener to new file input in dialog');
                        }
                      });
                    }
                  }
                }
              }
            }
          });
          
          dialogObserver.observe(dialog, {
            childList: true,
            subtree: true
          });
        }
      });
    } catch (error) {
      logger.error('Error checking for ChatGPT file elements', error);
    }
  }
  
  /**
   * Add a warning indicator to an attachment element
   * @param {HTMLElement} element - Element representing a PDF attachment
   */
  addWarningIndicatorToAttachment(element) {
    try {
      // Only add if we haven't already added one
      if (element.querySelector('.pdf-scanner-attachment-warning')) {
        return;
      }
      
      // Create a warning badge using CSS classes
      const warningBadge = document.createElement('div');
      warningBadge.className = 'pdf-scanner-attachment-warning';
      warningBadge.textContent = '!';
      
      // Make sure the element has position relative or absolute
      const currentPosition = window.getComputedStyle(element).position;
      if (currentPosition === 'static') {
        element.style.position = 'relative';
      }
      
      // Add tooltip behavior
      warningBadge.title = 'This PDF was scanned for secrets';
      
      // Add click handler to show more info
      warningBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        this.showSecretWarning('Unknown PDF', {
          secrets: true,
          findings: [{ type: 'POTENTIAL_RISK', confidence: 0.8 }]
        });
      });
      
      // Add to the element
      element.appendChild(warningBadge);
      
    } catch (error) {
      logger.error('Error adding warning indicator to attachment', error);
    }
  }
  
  /**
   * Set up monitoring for drag and drop events
   */
  setupDragAndDropMonitoring() {
    try {
      // Monitor dragover events
      document.addEventListener('dragover', (event) => {
        // Prevent default to allow drop
        event.preventDefault();
        
        // Just log for now
        if (this.debugMode) {
          logger.log('Drag event detected');
        }
      });
      
      // Monitor drop events
      document.addEventListener('drop', (event) => {
        // Always prevent default browser behavior
        event.preventDefault();
        
        if (event.dataTransfer && event.dataTransfer.files) {
          const files = Array.from(event.dataTransfer.files);
          const pdfFiles = files.filter(file => PDFMonitor._isPdfCandidate(file));
          
          if (pdfFiles.length > 0) {
            logger.log('PDF files dropped', {
              count: pdfFiles.length,
              names: pdfFiles.map(f => f.name)
            });
            
            // Process each dropped PDF file
            pdfFiles.forEach(file => {
              // Show scanning indicator to user
              this.showScanningIndicator(file.name);
              
              // Immediate scan of the PDF
              this.scanPDFImmediately(file).then(result => {
                logger.log('Immediate scan result for dropped file:', result);
                
                if (result.secrets) {
                  // If secrets found, show warning
                  this.showSecretWarning(file.name, result);
                } else {
                  // If no secrets found, show safe indicator
                  this.showSafeFileIndicator(file.name);
                }
              }).catch(error => {
                logger.error('Error during immediate scan of dropped PDF', error);
                this.showScanErrorIndicator(file.name);
              });
              
              // Also track the upload through our normal channels as backup
              this.trackUpload(file);
            });
          }
        }
      });
      
      logger.log('Drag and drop monitoring set up');
    } catch (error) {
      logger.error('Error setting up drag and drop monitoring', error);
    }
  }
  
  /**
   * Set up monitoring for clipboard paste events
   */
  setupClipboardMonitoring() {
    try {
      document.addEventListener('paste', (event) => {
        if (event.clipboardData && event.clipboardData.files) {
          const files = Array.from(event.clipboardData.files);
          const pdfFiles = files.filter(file => PDFMonitor._isPdfCandidate(file));
          
          if (pdfFiles.length > 0) {
            logger.log('PDF files pasted from clipboard', {
              count: pdfFiles.length,
              names: pdfFiles.map(f => f.name)
            });
            
            // Try to prevent default paste behavior for PDFs
            try {
              if (event.cancelable) {
                event.preventDefault();
                event.stopPropagation();
              }
            } catch (e) {
              logger.error('Error preventing default paste behavior', e);
            }
            
            // Process each pasted PDF file
            pdfFiles.forEach(file => {
              // Show scanning indicator to user
              this.showScanningIndicator(file.name);
              
              // Immediate scan of the PDF
              this.scanPDFImmediately(file).then(result => {
                logger.log('Immediate scan result for pasted file:', result);
                
                if (result.secrets) {
                  // If secrets found, show warning
                  this.showSecretWarning(file.name, result);
                } else {
                  // If no secrets found, show safe indicator
                  this.showSafeFileIndicator(file.name);
                }
              }).catch(error => {
                logger.error('Error during immediate scan of pasted PDF', error);
                this.showScanErrorIndicator(file.name);
              });
              
              // Also track the upload through our normal channels as backup
              this.trackUpload(file);
            });
          }
        }
      });
      
      logger.log('Clipboard monitoring set up');
    } catch (error) {
      logger.error('Error setting up clipboard monitoring', error);
    }
  }
  
  /**
   * Monitor for file selection dialog
   * This is a bit hacky but can help detect when a file dialog is opened
   */
  monitorFileSelectionDialog() {
    try {
      // Override the native file input click method
      const originalClick = HTMLInputElement.prototype.click;
      HTMLInputElement.prototype.click = function() {
        if (this.type === 'file') {
          logger.log('File selection dialog opened');
        }
        return originalClick.apply(this, arguments);
      };
      
      logger.log('File selection dialog monitoring set up');
    } catch (error) {
      logger.error('Error setting up file selection dialog monitoring', error);
    }
  }
  
  /**
   * Stop monitoring the page
   */
  stopMonitoring() {
    try {
      if (this.observer) {
        this.observer.disconnect();
      }
      
      // Remove all event listeners
      this.fileInputs.forEach(input => {
        input.removeEventListener('change', this.fileInputChangeHandler);
      });
      
      this.uploadState.monitoring = false;
      logger.log('Stopped monitoring');
    } catch (error) {
      logger.error('Error stopping monitoring', { error: error.message });
    }
  }
  
  /**
   * Scan the page for file input elements
   */
  scanForFileInputs() {
    try {
      const fileInputs = document.querySelectorAll('input[type="file"]');
      
      fileInputs.forEach(input => {
        if (!this.fileInputs.has(input)) {
          // New file input found
          this.fileInputs.add(input);
          
          // Bind change event
          this.fileInputChangeHandler = this.handleFileInputChange.bind(this);
          input.addEventListener('change', this.fileInputChangeHandler);
          
          logger.log('Found new file input', { 
            id: input.id, 
            name: input.name, 
            accept: input.accept 
          });
        }
      });
    } catch (error) {
      logger.error('Error scanning for file inputs', { error: error.message });
    }
  }
  
  /**
   * Set up monitoring for form submissions
   */
  setupFormSubmissionMonitoring() {
    try {
      // Find all forms and add submit listener
      document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', this.handleFormSubmit.bind(this));
      });
      
      // Also monitor all buttons that might trigger uploads
      document.querySelectorAll('button, [role="button"]').forEach(button => {
        button.addEventListener('click', this.handleButtonClick.bind(this));
      });
      
    } catch (error) {
      logger.error('Error setting up form submission monitoring', { error: error.message });
    }
  }
  
  /**
   * Handle file input change event
   * @param {Event} event - Change event
   */
  handleFileInputChange(event) {
    try {
      const input = event.target;
      const files = Array.from(input.files || []);
      
      // Filter for PDF files using shared logic
      const pdfFiles = files.filter(file => PDFMonitor._isPdfCandidate(file));
      
      if (pdfFiles.length === 0) {
        return;
      }
      
      logger.log('PDF files selected', { 
        count: pdfFiles.length,
        names: pdfFiles.map(f => f.name)
      });
      
      // IMMEDIATE SCAN: Scan PDFs right at selection time, before any HTTP request
      pdfFiles.forEach(file => {
        // First, prevent default upload behavior if possible
        try {
          // We can't always prevent the default behavior, but we can try
          // to delay it until after our scan completes
          if (event.cancelable) {
            event.preventDefault();
            event.stopPropagation();
          }
        } catch (e) {
          logger.error('Error preventing default upload behavior', e);
        }
        
        // Show scanning indicator to user
        this.showScanningIndicator(file.name);
        
        // Immediate scan of the PDF
        this.scanPDFImmediately(file).then(result => {
          logger.log('Immediate scan result:', result);
          
          if (result.secrets) {
            // If secrets found, show warning and prevent upload if possible
            this.showSecretWarning(file.name, result);
            
            // Try to clear the file input to prevent upload
            try {
              input.value = '';
              
              // Dispatch change event to notify the app that the file was removed
              const changeEvent = new Event('change', { bubbles: true });
              input.dispatchEvent(changeEvent);
              
              logger.log('Cleared file input after detecting secrets');
            } catch (e) {
              logger.error('Error clearing file input', e);
            }
          } else {
            // If no secrets found, allow upload to proceed
            logger.log('No secrets found, allowing upload to proceed');
            this.showSafeFileIndicator(file.name);
          }
        }).catch(error => {
          logger.error('Error during immediate PDF scan', error);
          // On error, we allow the upload to proceed but log the error
          this.showScanErrorIndicator(file.name);
        });
        
        // Also track the upload through our normal channels as backup
        this.trackUpload(file);
      });
      
    } catch (error) {
      logger.error('Error handling file input change', { error: error.message });
    }
  }
  
  /**
   * Handle form submission
   * @param {Event} event - Submit event
   */
  handleFormSubmit(event) {
    try {
      const form = event.target;
      
      // Check if form has any file inputs with PDFs
      const fileInputs = form.querySelectorAll('input[type="file"]');
      let hasPDF = false;
      
      fileInputs.forEach(input => {
        const files = Array.from(input.files || []);
        hasPDF = hasPDF || files.some(file => PDFMonitor._isPdfCandidate(file));
      });
      
      if (hasPDF) {
        logger.log('Form submitted with PDF files');
        // Form submission is tracked by the webRequest API
      }
    } catch (error) {
      logger.error('Error handling form submission', { error: error.message });
    }
  }
  
  /**
   * Handle button clicks that might trigger uploads
   * @param {Event} event - Click event
   */
  handleButtonClick(event) {
    try {
      const button = event.target.closest('button, [role="button"]');
      
      // Check if this button might be related to file uploads
      // This is a heuristic and may need refinement
      const isUploadRelated = 
        button.innerText?.toLowerCase().includes('upload') ||
        button.innerText?.toLowerCase().includes('attach') ||
        button.innerText?.toLowerCase().includes('file') ||
        button.innerText?.toLowerCase().includes('send') ||
        button.innerText?.toLowerCase().includes('submit') ||
        button.getAttribute('aria-label')?.toLowerCase().includes('upload') ||
        button.className?.toLowerCase().includes('upload');
      
      if (isUploadRelated) {
        logger.log('Potential upload button clicked', { 
          text: button.innerText,
          ariaLabel: button.getAttribute('aria-label')
        });
        
        // Note: actual upload interception happens via webRequest
      }
    } catch (error) {
      logger.error('Error handling button click', { error: error.message });
    }
  }
  
  /**
   * Track a file upload
   * @param {File} file - File being uploaded
   */
  trackUpload(file) {
    try {
      const fileId = `${file.name}-${file.size}-${Date.now()}`;
      
      this.uploadState.activeUploads.add(fileId);
      
      logger.log('Tracking file upload', { 
        fileId, 
        filename: file.name,
        size: file.size 
      });
      
      // Notify background about potential upcoming upload
      this.sendMessage({
        type: 'pdf_selected',
        fileId,
        filename: file.name,
        size: file.size,
        timestamp: Date.now()
      });
      
      // Try to read the file and send it to the background script
      // This is a backup method in case the webRequest API doesn't catch it
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const base64data = reader.result;
          this.sendMessage({
            type: 'intercepted_pdf',
            requestId: fileId,
            filename: file.name,
            fileSize: file.size,
            fileData: base64data
          }).catch(err => {
            logger.error('Error sending PDF to background', err);
          });
        };
        reader.onerror = (error) => {
          logger.error('Error reading PDF file', error);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        logger.error('Error reading file', error);
      }
      
    } catch (error) {
      logger.error('Error tracking upload', { error: error.message });
    }
  }
  
  /**
   * Handle incoming messages from service worker
   * @param {Object} message - Message object
   * @param {Object} sender - Message sender
   * @param {function} sendResponse - Function to send response
   * @returns {boolean} - Keep channel open for async response
   */
  handleMessage(message, sender, sendResponse) {
    try {
      logger.log('Received message', { type: message.type });
      
      switch (message.type) {
        case 'scan_result':
          this.handleScanResult(message);
          sendResponse({ success: true });
          break;
          
        case 'show_warning':
          // Direct request to show warning from background script
          this.showSecretWarning(message.filename, message.result);
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
          // Extension was reloaded, reinitialize
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
      
      // Show error message to user for context invalidation errors
      if (error.message.includes('Extension context') || 
          error.message.includes('invalidated') ||
          error.message.includes('destroyed')) {
        // Use the standalone error function if this is a context error
        showStandaloneError('PDF Scanner extension error. Please refresh the page.');
      }
      
      sendResponse({ success: false, error: error.message });
    }
    
    return true; // Keep message channel open for async response
  }
  
  /**
   * Handle scan result from service worker
   * @param {Object} message - Scan result message
   */
  handleScanResult(message) {
    try {
      const { requestId, result, filename } = message;
      
      logger.log('Received scan result', { 
        requestId, 
        filename,
        hasSecrets: result.secrets 
      });
      
      if (result.secrets) {
        this.showSecretWarning(filename, result);
      }
      
    } catch (error) {
      logger.error('Error handling scan result', { error: error.message });
    }
  }
  
  /**
   * Show warning UI when secrets are detected
   * @param {string} filename - PDF filename
   * @param {Object} result - Scan result
   */
  showSecretWarning(filename, result) {
    try {
      logger.log('Showing secret warning for file:', filename, result);
      
      // Remove any existing warnings
      this.removeExistingIndicators();
      this.removeExistingSecurityWarnings();
      
      // Create warning element with CSS classes
      const warningEl = document.createElement('div');
      warningEl.id = 'pdf-scanner-security-warning';
      warningEl.className = 'pdf-scanner-modal-overlay';
      
      // Create modal element
      const modalEl = document.createElement('div');
      modalEl.className = 'pdf-scanner-modal';
      
      // Create header
      const headerEl = document.createElement('div');
      headerEl.className = 'pdf-scanner-modal-header pdf-scanner-error-bg';
      
      // Create icon
      const iconEl = document.createElement('div');
      iconEl.innerHTML = '⚠️';
      iconEl.className = 'pdf-scanner-modal-icon';
      
      // Create title
      const titleEl = document.createElement('h2');
      titleEl.textContent = 'Security Risk Detected';
      titleEl.className = 'pdf-scanner-modal-title';
      
      // Create close button
      const closeBtn = document.createElement('div');
      closeBtn.innerHTML = '✕';
      closeBtn.className = 'pdf-scanner-modal-close';
      closeBtn.addEventListener('click', () => {
        warningEl.remove();
      });
      
      // Assemble header
      headerEl.appendChild(iconEl);
      headerEl.appendChild(titleEl);
      headerEl.appendChild(closeBtn);
      
      // Create content area
      const contentEl = document.createElement('div');
      contentEl.className = 'pdf-scanner-modal-content';
      
      // Create message
      const messageEl = document.createElement('p');
      messageEl.innerHTML = `<strong>The file "${filename}" contains sensitive information that should not be shared with AI models.</strong><br><br>Uploading this file could lead to data leakage.`;
      messageEl.className = 'pdf-scanner-modal-message';
      
      // Create findings section
      const findingsEl = document.createElement('div');
      findingsEl.className = 'pdf-scanner-findings-box';
      
      // Create findings title
      const findingsTitleEl = document.createElement('div');
      findingsTitleEl.textContent = 'Detected sensitive information:';
      findingsTitleEl.className = 'pdf-scanner-findings-title';
      findingsEl.appendChild(findingsTitleEl);
      
              // Create findings list
        const findingsListEl = document.createElement('ul');
        findingsListEl.className = 'pdf-scanner-findings-list';
      
      // Add findings - Make sure to use THIS specific result's findings
      if (result && result.findings && result.findings.length > 0) {
        // Create a deep copy of findings to avoid contamination
        const currentFindings = JSON.parse(JSON.stringify(result.findings));
        
        // Filter out generic non-informative findings that just show counts
        const meaningfulFindings = currentFindings.filter(finding => {
          // Skip findings that are just showing detection counts
          const isGenericCount = finding.value && finding.value.includes('detection(s)') && 
                               (finding.type === 'Language Detector' || 
                                finding.type === 'Sensitive Data' || 
                                finding.type === 'Token Limitation');
          return !isGenericCount;
        });
        
        meaningfulFindings.forEach(finding => {
          const findingEl = document.createElement('li');
          
          // Create more detailed finding information
          if (finding.type === 'Secret' && finding.value) {
            // For secrets, show the type and FULL value (no truncation)
            let displayText = `<strong>${finding.entity_type || finding.type}</strong>`;
            
            // Show the full secret value (no more truncation)
            if (finding.value) {
              displayText += `: ${finding.value}`;
            }
            
            if (finding.category) {
              displayText += ` <em>(${finding.category})</em>`;
            }
            
            findingEl.innerHTML = displayText;
          } else if (finding.type === 'URL') {
            findingEl.innerHTML = `<strong>${finding.type}</strong>: ${finding.value}`;
          } else if (finding.value && !finding.value.includes('detection(s)')) {
            // Show the actual value if available and not just a count
            findingEl.innerHTML = `<strong>${finding.type}</strong>: ${finding.value}`;
          } else {
            // Skip non-informative findings
            return;
          }
          
          findingEl.className = 'pdf-scanner-finding-item';
          
          findingsListEl.appendChild(findingEl);
        });
        
        // If all findings were filtered out, add a generic message
        if (findingsListEl.children.length === 0) {
          const findingEl = document.createElement('li');
          findingEl.textContent = 'Potential sensitive information detected';
          findingEl.className = 'pdf-scanner-finding-item';
          findingsListEl.appendChild(findingEl);
        }
      } else {
        const findingEl = document.createElement('li');
        findingEl.textContent = 'Potential sensitive information detected';
        findingEl.className = 'pdf-scanner-finding-item';
        findingsListEl.appendChild(findingEl);
      }
      
      findingsEl.appendChild(findingsListEl);
      contentEl.appendChild(messageEl);
      contentEl.appendChild(findingsEl);
      
      // Assemble modal
      modalEl.appendChild(headerEl);
      modalEl.appendChild(contentEl);
      
      // Add modal to warning element
      warningEl.appendChild(modalEl);
      
      // Add to page
      document.body.appendChild(warningEl);
      
      // Add escape key handler to dismiss
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          // Ensure all related warning elements are removed
          this.removeExistingSecurityWarnings();
          document.removeEventListener('keydown', escHandler);
        }
      };
      
      // Remove any existing escape handlers first to avoid duplicates
      document.removeEventListener('keydown', this._currentEscHandler);
      document.addEventListener('keydown', escHandler);
      this._currentEscHandler = escHandler; // Store reference to current handler
      
      // No auto-remove for security warnings - user must take action
      
    } catch (error) {
      logger.error('Error showing secret warning', { error: error.message });
    }
  }
  
  /**
   * Send message to service worker
   * @param {Object} message - Message to send
   * @returns {Promise} - Response promise
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        // Check if chrome.runtime is available
        if (!chrome || !chrome.runtime) {
          // Extension context might be invalid or not fully loaded
          return reject(new Error('Extension context unavailable'));
        }
        
        chrome.runtime.sendMessage(message, response => {
          // Check immediately for last error to catch context invalidation
          const runtimeError = chrome.runtime.lastError;
          if (runtimeError) {
            if (runtimeError.message.includes('context invalidated')) {
              // Handle context invalidated error specially - this can happen during extension reloads
              this.showScanErrorIndicator(message.filename || 'File', 'Extension was reloaded. Please try again.');
              console.error('[PDF Scanner] Extension context invalidated. The extension may have been reloaded.');
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
        // Show a more user-friendly error
        if (error.message.includes('Extension context') || 
            error.message.includes('invalidated') ||
            error.message.includes('destroyed')) {
          this.showScanErrorIndicator(message.filename || 'File', 'Extension was reloaded. Please try again.');
          console.error('[PDF Scanner] Extension context error:', error);
        }
        reject(error);
      }
    });
  }
  
  /**
   * Scan a PDF file immediately upon selection
   * @param {File} file - PDF file to scan
   * @returns {Promise<Object>} - Scan result
   */
  async scanPDFImmediately(file) {
    try {
      // Add extensive debug logging to track file contamination
      logger.log(`=== IMMEDIATE SCAN START ===`);
      logger.log(`Scanning PDF immediately: ${file.name} (${file.size} bytes)`);
      logger.log(`File details:`, {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        webkitRelativePath: file.webkitRelativePath || 'N/A'
      });
      
      // Read file as data URL
      const fileData = await this.readFileAsDataURL(file);
      
      // Log the actual data size after reading
      logger.log(`File data read, sending to background. Data length: ${fileData ? fileData.length : 0}`);
      
      // Send to background script for scanning
      const response = await this.sendMessage({
        type: 'scan',
        filename: file.name,
        fileSize: file.size,
        fileData: fileData
      });
      
      if (!response || !response.success) {
        throw new Error(response?.error || 'Unknown error scanning PDF');
      }
      
      logger.log(`=== IMMEDIATE SCAN COMPLETE ===`);
      return response.result;
    } catch (error) {
      logger.error('Error scanning PDF immediately:', error);
      
      // Handle context invalidated errors specially
      if (error.message.includes('Extension context') || 
          error.message.includes('invalidated') || 
          error.message.includes('unavailable')) {
        this.showScanErrorIndicator(
          file.name,
          'Extension was reloaded or is unavailable. Please refresh the page and try again.'
        );
      } else {
        // For other errors, show a generic scan error
        this.showScanErrorIndicator(file.name);
      }
      
      throw error;
    }
  }
  
  /**
   * Read file as data URL
   * @param {File} file - File to read
   * @returns {Promise<string>} - Data URL
   */
  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      // Add debug logging
      logger.log(`Reading file: ${file.name}, size: ${file.size}, type: ${file.type}, lastModified: ${file.lastModified}`);
      
      reader.onload = () => {
        const result = reader.result;
        const dataSize = result ? result.length : 0;
        logger.log(`File read complete: ${file.name}, data size: ${dataSize}`);
        
        // Log a preview of the data to help debug contamination
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
  
  /**
   * Show scanning indicator to user
   * @param {string} filename - Name of file being scanned
   */
  showScanningIndicator(filename) {
    try {
      // Remove any existing indicators
      this.removeExistingIndicators();
      
      // Create indicator element with CSS classes
      const indicatorEl = document.createElement('div');
      indicatorEl.id = 'pdf-scanner-indicator';
      indicatorEl.className = 'pdf-scanner-indicator pdf-scanner-info-bg';
      
      // Create spinner
      const spinnerEl = document.createElement('div');
      spinnerEl.className = 'pdf-scanner-spinner';
      
      // Add animation
      const styleEl = document.createElement('style');
      styleEl.textContent = `
        @keyframes pdf-scanner-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleEl);
      
      // Create message
      const messageEl = document.createElement('div');
      messageEl.textContent = `Scanning "${filename}" for secrets...`;
      
      // Assemble UI
      indicatorEl.appendChild(spinnerEl);
      indicatorEl.appendChild(messageEl);
      
      // Add to page
      document.body.appendChild(indicatorEl);
      
      // Auto-remove after 10 seconds (failsafe)
      setTimeout(() => {
        this.removeExistingIndicators();
      }, 10000);
    } catch (error) {
      logger.error('Error showing scanning indicator:', error);
    }
  }
  
  /**
   * Show indicator for safe file
   * @param {string} filename - Name of safe file
   * @param {string} [customMessage] - Optional custom message to show
   */
  showSafeFileIndicator(filename, customMessage) {
    try {
      // Remove any existing indicators
      this.removeExistingIndicators();
      
      // Create indicator element with CSS classes
      const indicatorEl = document.createElement('div');
      indicatorEl.id = 'pdf-scanner-indicator';
      indicatorEl.className = 'pdf-scanner-indicator pdf-scanner-success-bg';
      
      // Create icon
      const iconEl = document.createElement('div');
      iconEl.innerHTML = '✅';
      iconEl.className = 'pdf-scanner-indicator-icon';
      
      // Create message
      const messageEl = document.createElement('div');
      
      // Use custom message if provided, otherwise use default
      if (customMessage) {
        messageEl.textContent = customMessage;
      } else {
        messageEl.textContent = `"${filename}" is safe to upload. No secrets detected.`;
      }
      
      // Create close button
      const closeEl = document.createElement('button');
      closeEl.textContent = '×';
      closeEl.className = 'pdf-scanner-indicator-close';
      closeEl.addEventListener('click', () => {
        indicatorEl.remove();
      });
      
      // Assemble UI
      indicatorEl.appendChild(iconEl);
      indicatorEl.appendChild(messageEl);
      indicatorEl.appendChild(closeEl);
      
      // Add to page
      document.body.appendChild(indicatorEl);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (document.body.contains(indicatorEl)) {
          indicatorEl.remove();
        }
      }, 5000);
    } catch (error) {
      logger.error('Error showing safe file indicator:', error);
    }
  }
  
  /**
   * Show indicator for scan error
   * @param {string} filename - Name of file with scan error
   * @param {string} [errorMessage] - Optional custom error message
   */
  showScanErrorIndicator(filename, errorMessage) {
    try {
      // Remove any existing indicators
      this.removeExistingIndicators();
      
      // Create indicator element with CSS classes
      const indicatorEl = document.createElement('div');
      indicatorEl.id = 'pdf-scanner-indicator';
      indicatorEl.className = 'pdf-scanner-indicator pdf-scanner-warning-bg';
      
      // Create icon
      const iconEl = document.createElement('div');
      iconEl.innerHTML = '⚠️';
      iconEl.className = 'pdf-scanner-indicator-icon';
      
      // Create message
      const messageEl = document.createElement('div');
      if (errorMessage) {
        messageEl.textContent = errorMessage;
      } else {
        messageEl.textContent = `Error scanning "${filename}". Proceeding with caution.`;
      }
      
      // Create close button
      const closeEl = document.createElement('button');
      closeEl.textContent = '×';
      closeEl.className = 'pdf-scanner-indicator-close';
      closeEl.addEventListener('click', () => {
        indicatorEl.remove();
      });
      
      // Assemble UI
      indicatorEl.appendChild(iconEl);
      indicatorEl.appendChild(messageEl);
      indicatorEl.appendChild(closeEl);
      
      // Add to page
      document.body.appendChild(indicatorEl);
      
      // No auto-remove for error messages - user must acknowledge
    } catch (error) {
      logger.error('Error showing scan error indicator:', error);
    }
  }
  
  /**
   * Remove any existing indicators
   */
  removeExistingIndicators() {
    try {
      const existingIndicator = document.getElementById('pdf-scanner-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }
    } catch (error) {
      logger.error('Error removing existing indicators:', error);
    }
  }
  
  /**
   * Remove any existing security warning popups
   */
  removeExistingSecurityWarnings() {
    try {
      const existingWarning = document.getElementById('pdf-scanner-security-warning');
      if (existingWarning) {
        existingWarning.remove();
      }
      
      // Also look for any elements that might be security warnings without IDs
      const possibleWarnings = document.querySelectorAll('div[style*="z-index: 10000"]');
      possibleWarnings.forEach(el => {
        if (el.innerHTML.includes('Security Risk Detected')) {
          el.remove();
        }
      });
    } catch (error) {
      logger.error('Error removing existing security warnings:', error);
    }
  }
}

/**
 * Show a standalone error message when the extension has problems initializing
 * This is a utility function outside the class in case we can't instantiate the class
 */
function showStandaloneError(message) {
  try {
    // Create indicator element with CSS classes
    const indicatorEl = document.createElement('div');
    indicatorEl.id = 'pdf-scanner-indicator';
    indicatorEl.className = 'pdf-scanner-indicator pdf-scanner-warning-bg';
    
    // Create icon
    const iconEl = document.createElement('div');
    iconEl.innerHTML = '⚠️';
    iconEl.className = 'pdf-scanner-indicator-icon';
    
    // Create message
    const messageEl = document.createElement('div');
    messageEl.textContent = message || 'PDF Scanner extension encountered an error. Please refresh the page.';
    
    // Create close button
    const closeEl = document.createElement('button');
    closeEl.textContent = '×';
    closeEl.className = 'pdf-scanner-indicator-close';
    closeEl.addEventListener('click', () => indicatorEl.remove());
    
    // Assemble UI
    indicatorEl.appendChild(iconEl);
    indicatorEl.appendChild(messageEl);
    indicatorEl.appendChild(closeEl);
    
    // Add to page
    document.body.appendChild(indicatorEl);
  } catch (error) {
    console.error('[PDF Scanner] Error showing standalone error:', error);
  }
}

/**
 * Safe initialization function
 */
function initializePDFMonitor() {
  try {
    console.log('[PDF Scanner] Initializing PDF Monitor...');
    new PDFMonitor();
  } catch (error) {
    console.error('[PDF Scanner] Error creating PDF Monitor:', error);
    showStandaloneError('Error initializing PDF Scanner. Please refresh the page.');
  }
}

// Initialize the monitor when the page is ready
try {
  if (!chrome || !chrome.runtime) {
    // Chrome API not available - show standalone error
    showStandaloneError('PDF Scanner extension cannot access Chrome API. Please reload the page.');
  } else {
    // Check if we can send a simple test message to verify extension context
    chrome.runtime.sendMessage({type: 'ping'}, response => {
      if (chrome.runtime.lastError) {
        showStandaloneError('PDF Scanner extension not responding. Extension may need to be reloaded.');
        console.error('[PDF Scanner] Extension context error:', chrome.runtime.lastError);
        return;
      }
      
      // Context is valid, initialize when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePDFMonitor);
      } else if (document.readyState === 'interactive') {
        // DOM is interactive but not fully loaded - wait a bit more
        setTimeout(initializePDFMonitor, 100);
      } else {
        // Document is fully loaded
        initializePDFMonitor();
      }
    });
  }
} catch (error) {
  console.error('[PDF Scanner] Error initializing PDF Monitor:', error);
  showStandaloneError('Error initializing PDF Scanner. Please refresh the page.');
}
