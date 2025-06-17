// PDF Scanner Popup

// Create a logger for the popup
const logger = {
  log(message, data) {
    try {
      if (data !== undefined) {
        console.log(`[PDF Scanner Popup] ${message}`, data);
      } else {
        console.log(`[PDF Scanner Popup] ${message}`);
      }
    } catch (e) {
      // Silent fail if console is not available
    }
  },

  warn(message, data) {
    try {
      if (data !== undefined) {
        console.warn(`[PDF Scanner Popup] WARNING: ${message}`, data);
      } else {
        console.warn(`[PDF Scanner Popup] WARNING: ${message}`);
      }
    } catch (e) {
      // Silent fail if console is not available
    }
  },

  error(message, data) {
    try {
      if (data !== undefined) {
        console.error(`[PDF Scanner Popup] ERROR: ${message}`, data);
      } else {
        console.error(`[PDF Scanner Popup] ERROR: ${message}`);
      }
    } catch (e) {
      // Silent fail if console is not available
    }
  }
};

/**
 * PDF Scanner Popup Controller
 */
class PDFScannerPopup {
  constructor() {
    // Initialize element references
    this.initializeElements();

    // Initialize state
    this.state = {
      isActive: true,
      scanCount: 0,
      lastScan: null,
      isLoading: true
    };

    // Check if we're in development mode
    this.isDevelopment = this.checkDevelopmentMode();
    
    this.init();
  }
  
  /**
   * Get DOM element references
   */
  initializeElements() {
    // Get all required DOM elements
    this.statusIndicator = document.getElementById('status-indicator');
    this.statusText = document.querySelector('.status-text');
    this.scanCountElement = document.getElementById('scan-count');
    this.viewLogsBtn = document.getElementById('view-logs');
    this.devBadgeContainer = document.getElementById('dev-badge-container');
    
    // Log if any elements are missing
    if (!this.statusIndicator) logger.error('Missing element: #status-indicator');
    if (!this.statusText) logger.error('Missing element: .status-text');
    if (!this.scanCountElement) logger.error('Missing element: #scan-count');
    if (!this.viewLogsBtn) logger.error('Missing element: #view-logs');
    if (!this.devBadgeContainer && this.checkDevelopment && this.checkDevelopment()) logger.warn('Dev badge container missing (dev mode only)');
  }
  
  /**
   * Initialize the popup
   */
  init() {
    try {
      logger.log('Initializing PDF Scanner Popup');
      
      // Bind event handlers
      this.bindEvents();
      
      // Load scan statistics
      this.loadScanStats();
      
      logger.log('Popup initialized');
    } catch (error) {
      logger.error('Error initializing popup:', error);
    }
  }
  
  /**
   * Load scan stats from background script
   */
  async loadScanStats() {
    try {
      this.state.isLoading = true;
      this.updateStatusDisplay();
      
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_SCAN_STATS' 
      });
      
      if (response && response.success) {
        this.state.scanCount = response.scanCount;
        this.state.lastScan = response.lastScan;
        this.state.isActive = response.isActive;
        logger.log('Scan stats loaded:', this.state);
      } else {
        logger.error('Error loading scan stats:', response);
      }
      
      this.state.isLoading = false;
      this.updateStatusDisplay();
    } catch (error) {
      logger.error('Error loading scan stats:', error);
      this.state.isLoading = false;
      this.updateStatusDisplay();
    }
  }
  
  /**
   * Check if the extension is running in development mode
   * @returns {boolean} - Whether we're in development mode
   */
  checkDevelopmentMode() {
    try {
      const manifest = chrome.runtime.getManifest();
      if (!manifest) return false;
      
      // Check for development indicators
      const isDev = manifest.version_name && manifest.version_name.toLowerCase().includes('dev');
      return isDev;
    } catch (error) {
      logger.error('Error checking development mode:', error);
      return false;
    }
  }
  
  /**
   * Show development mode indicator
   */
  showDevelopmentModeIndicator() {
    try {
      if (!this.devBadgeContainer) {
        logger.error('Cannot show dev mode indicator: devBadgeContainer not found');
        return;
      }
      
      const devBadge = document.createElement('div');
      devBadge.className = 'dev-badge';
      devBadge.textContent = 'DEV MODE';
      this.devBadgeContainer.appendChild(devBadge);
      
      logger.log('Running in DEVELOPMENT mode');
    } catch (error) {
      logger.error('Error showing development mode indicator:', error);
    }
  }
  
  /**
   * Toggle the active state of the scanner
   */
  async toggleActiveState() {
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'TOGGLE_ACTIVE_STATE' 
      });
      
      if (response && response.success) {
        this.state.isActive = response.isActive;
        this.updateStatusDisplay();
        logger.log(`Scanner ${this.state.isActive ? 'activated' : 'deactivated'}`);
      } else {
        logger.error('Error toggling active state:', response);
      }
    } catch (error) {
      logger.error('Error toggling active state:', error);
    }
  }
  
  /**
   * Update the status display based on current state
   */
  updateStatusDisplay() {
    try {
      // Update status indicator
      if (this.statusIndicator) {
        this.statusIndicator.className = 'status-indicator';
        
        if (this.state.isLoading) {
          this.statusIndicator.classList.add('loading');
        } else if (this.state.isActive) {
          this.statusIndicator.classList.add('active');
        } else {
          this.statusIndicator.classList.add('inactive');
        }
      }
      
      // Update status text
      if (this.statusText) {
        if (this.state.isLoading) {
          this.statusText.textContent = 'Loading status...';
        } else if (this.state.isActive) {
          this.statusText.textContent = 'Active – Monitoring uploads';
        } else {
          this.statusText.textContent = 'Inactive – Scanner paused';
        }
      }
      
      // Update scan count
      if (this.scanCountElement) {
        this.scanCountElement.textContent = this.state.scanCount;
      }
    } catch (error) {
      logger.error('Error updating status display:', error);
    }
  }
  
  /**
   * Bind event handlers to UI elements
   */
  bindEvents() {
    try {
      // Status indicator click handler
      if (this.statusIndicator) {
        this.statusIndicator.addEventListener('click', () => {
          this.toggleActiveState();
        });
      }
      
      // Status text click handler (for better UX)
      if (this.statusText) {
        this.statusText.addEventListener('click', () => {
          this.toggleActiveState();
        });
      }
      
      // View logs button handler
      if (this.viewLogsBtn) {
        this.viewLogsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openDevToolsConsole();
        });
      }
      
      logger.log('Event handlers bound');
    } catch (error) {
      logger.error('Error binding events:', error);
    }
  }
  
  /**
   * Open Chrome DevTools console
   */
  openDevToolsConsole() {
    try {
      // This will output a special console message that helps
      // users find the logs when DevTools opens
      console.log('%c PDF Scanner Logs ', 
        'background: #2196F3; color: white; font-size: 16px; font-weight: bold; padding: 4px;');
      console.log('Look for log messages prefixed with [PDF Scanner] to find scanner activity.');
      
      // Create and trigger a keyboard event to open DevTools
      // Note: This is a hacky way and might not work in all browsers/scenarios
      // The better approach is to include instructions for the user
      chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    } catch (error) {
      logger.error('Error opening DevTools console:', error);
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PDFScannerPopup();
});
