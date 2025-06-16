// PDF Scanner Extension - Popup Script

// Create a logger for the popup (since popup scripts can't import modules directly)
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

logger.log('PDF Scanner popup loaded');

class PDFScannerPopup {
  constructor() {
    // Initialize element references
    this.initializeElements();

    this.selectedFile = null;
    this.isScanning = false;
    this.loadingState = {
      initial: true,
      fileSelected: false,
      scanning: false,
      scanComplete: false,
      error: false
    };

    // Check if we're in development mode
    this.isDevelopment = this.checkDevelopmentMode();
    
    this.init();
  }
  
  initializeElements() {
    // Get all required DOM elements
    this.pdfInput = document.getElementById('pdfInput');
    this.scanButton = document.getElementById('scanButton');
    this.statusElement = document.getElementById('status');
    this.fileLabel = document.querySelector('.file-label');
    this.fileText = document.querySelector('.file-text');
    this.buttonText = document.querySelector('.button-text');
    this.spinner = document.querySelector('.spinner');
    this.popupContainer = document.querySelector('.popup-container');
    
    // Log if any elements are missing
    if (!this.pdfInput) logger.error('Missing element: #pdfInput');
    if (!this.scanButton) logger.error('Missing element: #scanButton');
    if (!this.statusElement) logger.error('Missing element: #status');
    if (!this.fileLabel) logger.error('Missing element: .file-label');
    if (!this.fileText) logger.error('Missing element: .file-text');
    if (!this.buttonText) logger.error('Missing element: .button-text');
    if (!this.spinner) logger.error('Missing element: .spinner');
    if (!this.popupContainer) logger.error('Missing element: .popup-container');
  }
  
  checkDevelopmentMode() {
    // Check extension version for development mode
    const manifest = chrome.runtime.getManifest();
    return manifest.version.startsWith('0.') || 
           (manifest.version_name && manifest.version_name.includes('Development'));
  }

  init() {
    this.bindEvents();
    this.updateStatus('Select a PDF file to begin scanning', 'info');
    
    // Show development mode indicator if needed
    if (this.isDevelopment) {
      this.showDevelopmentModeIndicator();
    }
    
    // Update UI state
    this.updateLoadingState('initial');
  }
  
  showDevelopmentModeIndicator() {
    // Check if popupContainer exists before appending
    if (!this.popupContainer) {
      logger.error('Cannot show dev mode indicator: popupContainer not found');
      return;
    }
    
    const devBadge = document.createElement('div');
    devBadge.className = 'dev-badge';
    devBadge.textContent = 'DEV MODE';
    this.popupContainer.appendChild(devBadge);
    
    // Add dev mode class to body for styling
    document.body.classList.add('dev-mode');
    
    logger.log('Running in DEVELOPMENT mode');
  }
  
  updateLoadingState(state) {
    // Reset all states
    Object.keys(this.loadingState).forEach(key => {
      this.loadingState[key] = false;
    });
    
    // Set new state
    if (this.loadingState.hasOwnProperty(state)) {
      this.loadingState[state] = true;
    }
    
    // Update UI based on state
    this.updateUIForLoadingState();
  }
  
  updateUIForLoadingState() {
    // Update UI elements based on current loading state
    if (this.loadingState.scanning) {
      this.setScanning(true);
    } else if (this.loadingState.scanComplete) {
      this.setScanning(false);
      this.scanButton.disabled = false;
    } else if (this.loadingState.fileSelected) {
      this.setScanning(false);
      this.scanButton.disabled = false;
    } else if (this.loadingState.error) {
      this.setScanning(false);
      this.scanButton.disabled = !this.selectedFile;
    } else {
      // Initial state
      this.setScanning(false);
      this.scanButton.disabled = !this.selectedFile;
    }
  }

  /**
   * Bind event handlers to UI elements
   */
  bindEvents() {
    // File input change handler
    if (this.pdfInput) {
      this.pdfInput.addEventListener('change', (event) => {
        this.handleFileSelect(event);
      });
    } else {
      logger.error('Cannot bind events: pdfInput not found');
    }

    // Scan button click handler
    if (this.scanButton) {
      this.scanButton.addEventListener('click', () => {
        this.handleScanClick();
      });
    } else {
      logger.error('Cannot bind events: scanButton not found');
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
      this.handleBackgroundMessage(message);
    });
  }

  /**
   * Handle file selection from the file input
   * @param {Event} event - Change event from file input
   */
  handleFileSelect(event) {
    const file = event.target.files[0];

    if (!file) {
      this.resetFileSelection();
      return;
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      this.updateStatus('Please select a PDF file', 'error');
      this.resetFileSelection();
      this.updateLoadingState('error');
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.updateStatus('File too large. Maximum size is 10MB', 'error');
      this.resetFileSelection();
      this.updateLoadingState('error');
      return;
    }

    this.selectedFile = file;
    
    // Update file label if available
    if (this.fileLabel) {
      this.fileLabel.classList.add('has-file');
    }
    
    // Update file text if available
    if (this.fileText) {
      this.fileText.textContent = file.name;
    }
    
    this.updateStatus(`Ready to scan: ${file.name} (${this.formatFileSize(file.size)})`, 'success');
    this.updateLoadingState('fileSelected');
  }

  /**
   * Reset the file selection UI
   */
  resetFileSelection() {
    this.selectedFile = null;
    
    // Reset file label if available
    if (this.fileLabel) {
      this.fileLabel.classList.remove('has-file');
    }
    
    // Reset file text if available
    if (this.fileText) {
      this.fileText.textContent = 'Choose PDF file';
    }
    
    // Disable scan button if available
    if (this.scanButton) {
      this.scanButton.disabled = true;
    }
    
    // Reset file input if available
    if (this.pdfInput) {
      this.pdfInput.value = '';
    }
  }

  async handleScanClick() {
    if (!this.selectedFile || this.isScanning) {
      return;
    }

    this.updateLoadingState('scanning');
    this.updateStatus('Scanning PDF for secrets...', 'info');

    try {
      // Convert file to base64 for messaging
      const fileData = await this.fileToBase64(this.selectedFile);

      // Send scan request to background script
      const response = await this.sendMessageToBackground({
        type: 'scan',
        fileData: fileData,
        fileName: this.selectedFile.name,
        fileSize: this.selectedFile.size,
      });

      this.handleScanResponse(response);
      this.updateLoadingState('scanComplete');
    } catch (error) {
      logger.error('Scan error:', error);
      this.updateStatus(`Scan failed: ${error.message}`, 'error');
      this.updateLoadingState('error');
    }
  }

  handleBackgroundMessage(message) {
    logger.log('Popup received message:', message);

    switch (message.type) {
      case 'scanResult':
        this.handleScanResponse(message.data);
        break;
      case 'scanError':
        this.updateStatus(`Scan error: ${message.error}`, 'error');
        this.setScanning(false);
        break;
      default:
        logger.log('Unknown message type:', message.type);
    }
  }

  handleScanResponse(response) {
    logger.log('Scan response:', response);

    if (!response || !response.success) {
      this.updateStatus(`Scan failed: ${response?.error || 'Unknown error'}`, 'error');
      return;
    }

    const { secrets, findings } = response.result || {};

    if (secrets) {
      this.updateStatus(
        `⚠️ Secrets detected! Found ${findings?.length || 0} potential security issues. 
         Please review your document before uploading.`,
        'warning'
      );

      // Show browser notification for secrets found
      this.showSecretsNotification(findings);
    } else {
      this.updateStatus('✅ No secrets detected. File appears safe to upload.', 'success');
    }
  }

  showSecretsNotification(findings) {
    // Send message to background script to show notification
    chrome.runtime.sendMessage({
      type: 'showNotification',
      title: 'Secrets Detected in PDF',
      message: `Found ${findings?.length || 0} potential security issues in your PDF.`,
      findings: findings,
    });
  }

  /**
   * Set the UI to scanning or not scanning state
   * @param {boolean} isScanning - Whether scanning is in progress
   */
  setScanning(isScanning) {
    this.isScanning = isScanning;
    
    // Update button state
    if (this.scanButton) {
      this.scanButton.disabled = isScanning;
    }
    
    // Update spinner
    if (this.spinner) {
      this.spinner.style.display = isScanning ? 'inline-block' : 'none';
    }
    
    // Update button text
    if (this.buttonText) {
      this.buttonText.textContent = isScanning ? 'Scanning...' : 'Scan PDF';
    }
    
    logger.log(`Scanning state set to: ${isScanning}`);
  }

  /**
   * Update status message in the UI
   * @param {string} message - Status message to display
   * @param {string} type - Status type (info, success, warning, error)
   */
  updateStatus(message, type = 'info') {
    // Safety check for statusElement
    if (!this.statusElement) {
      logger.error('Cannot update status: statusElement not found');
      return;
    }
    
    // Clear previous status classes
    this.statusElement.classList.remove('active', 'inactive', 'warning', 'error', 'success', 'info');
    
    // Add new status class
    this.statusElement.classList.add(type);
    
    // Update text content
    this.statusElement.textContent = message;
    
    // Log status update
    logger.log(`Status updated [${type}]: ${message}`);
  }

  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async sendMessageToBackground(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  formatFileSize(bytes) {
    if (bytes === 0) {
      return '0 Bytes';
    }

    // Use a lookup table for units
    const units = {
      0: 'Bytes',
      1: 'KB',
      2: 'MB',
      3: 'GB'
    };
    
    const k = 1024;
    const i = Math.min(3, Math.floor(Math.log(bytes) / Math.log(k)));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PDFScannerPopup();
});
