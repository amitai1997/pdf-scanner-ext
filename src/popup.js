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
    this.pdfInput = document.getElementById('pdfInput');
    this.scanButton = document.getElementById('scanButton');
    this.statusElement = document.getElementById('status');
    this.fileLabel = document.querySelector('.file-label');
    this.buttonText = document.querySelector('.button-text');
    this.spinner = document.querySelector('.spinner');
    this.popupContainer = document.querySelector('.popup-container');

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

  bindEvents() {
    // File input change handler
    this.pdfInput.addEventListener('change', (event) => {
      this.handleFileSelect(event);
    });

    // Scan button click handler
    this.scanButton.addEventListener('click', () => {
      this.handleScanClick();
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
      this.handleBackgroundMessage(message);
    });
  }

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
    this.fileLabel.classList.add('has-file');
    this.fileLabel.querySelector('.file-text').textContent = file.name;
    this.updateStatus(`Ready to scan: ${file.name} (${this.formatFileSize(file.size)})`, 'success');
    this.updateLoadingState('fileSelected');
  }

  resetFileSelection() {
    this.selectedFile = null;
    this.fileLabel.classList.remove('has-file');
    this.fileLabel.querySelector('.file-text').textContent = 'Choose PDF file';
    this.scanButton.disabled = true;
    this.pdfInput.value = '';
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

  setScanning(isScanning) {
    this.isScanning = isScanning;
    this.scanButton.disabled = isScanning || !this.selectedFile;

    if (isScanning) {
      this.scanButton.classList.add('scanning');
      this.buttonText.textContent = 'Scanning...';
      this.spinner.style.display = 'inline';
    } else {
      this.scanButton.classList.remove('scanning');
      this.buttonText.textContent = 'Scan for Secrets';
      this.spinner.style.display = 'none';
    }
  }

  updateStatus(message, type = 'info') {
    const statusText = this.statusElement.querySelector('.status-text');
    statusText.textContent = message;

    // Reset classes
    statusText.className = 'status-text';

    // Add status type class
    switch (type) {
      case 'success':
        statusText.classList.add('status-success');
        break;
      case 'warning':
        statusText.classList.add('status-warning');
        break;
      case 'error':
        statusText.classList.add('status-error');
        break;
      default:
        // info - no additional class
        break;
    }
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
