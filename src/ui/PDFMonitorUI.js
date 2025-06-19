/** UI primitives (modals, indicators) injected into host pages by PDF Scanner. */

class PDFMonitorUI {
  constructor(logger) {
    this.logger = logger;
    this._currentEscHandler = null;
  }

  /**
   * Show warning UI when secrets are detected
   * @param {string} filename - PDF filename
   * @param {Object} result - Scan result
   */
  showSecretWarning(filename, result) {
    try {
      this.logger.log('Showing secret warning for file:', filename, result);
      
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
      const headerEl = this._createModalHeader();
      
      // Create content area
      const contentEl = this._createModalContent(filename, result);
      
      // Assemble modal
      modalEl.appendChild(headerEl);
      modalEl.appendChild(contentEl);
      warningEl.appendChild(modalEl);
      
      // Add to page
      document.body.appendChild(warningEl);
      
      // Add escape key handler
      this._addEscapeHandler(() => this.removeExistingSecurityWarnings());
      
    } catch (error) {
      this.logger.error('Error showing secret warning', { error: error.message });
    }
  }

  /**
   * Show scanning indicator to user
   * @param {string} filename - Name of file being scanned
   */
  showScanningIndicator(filename) {
    try {
      this.removeExistingIndicators();
      
      const indicatorEl = document.createElement('div');
      indicatorEl.id = 'pdf-scanner-indicator';
      indicatorEl.className = 'pdf-scanner-indicator pdf-scanner-info-bg';
      
      // Create spinner
      const spinnerEl = document.createElement('div');
      spinnerEl.className = 'pdf-scanner-spinner';
      
      // Add animation styles if not present
      this._ensureSpinnerAnimation();
      
      // Create message
      const messageEl = document.createElement('div');
      messageEl.textContent = `Scanning "${filename}" for secrets...`;
      
      // Assemble UI
      indicatorEl.appendChild(spinnerEl);
      indicatorEl.appendChild(messageEl);
      document.body.appendChild(indicatorEl);
      
      // Auto-remove after 10 seconds (failsafe)
      setTimeout(() => this.removeExistingIndicators(), 10000);
      
    } catch (error) {
      this.logger.error('Error showing scanning indicator:', error);
    }
  }

  /**
   * Show indicator for safe file
   * @param {string} filename - Name of safe file
   * @param {string} [customMessage] - Optional custom message to show
   */
  showSafeFileIndicator(filename, customMessage) {
    try {
      this.removeExistingIndicators();
      
      const indicatorEl = document.createElement('div');
      indicatorEl.id = 'pdf-scanner-indicator';
      indicatorEl.className = 'pdf-scanner-indicator pdf-scanner-success-bg';
      
      const iconEl = document.createElement('div');
      iconEl.innerHTML = '✅';
      iconEl.className = 'pdf-scanner-indicator-icon';
      
      const messageEl = document.createElement('div');
      messageEl.textContent = customMessage || 
        `"${filename}" is safe to upload. No secrets detected.`;
      
      const closeEl = this._createIndicatorCloseButton(() => indicatorEl.remove());
      
      indicatorEl.appendChild(iconEl);
      indicatorEl.appendChild(messageEl);
      indicatorEl.appendChild(closeEl);
      document.body.appendChild(indicatorEl);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (document.body.contains(indicatorEl)) {
          indicatorEl.remove();
        }
      }, 5000);
      
    } catch (error) {
      this.logger.error('Error showing safe file indicator:', error);
    }
  }

  /**
   * Show indicator for scan error
   * @param {string} filename - Name of file with scan error
   * @param {string} [errorMessage] - Optional custom error message
   */
  showScanErrorIndicator(filename, errorMessage) {
    try {
      this.removeExistingIndicators();
      
      const indicatorEl = document.createElement('div');
      indicatorEl.id = 'pdf-scanner-indicator';
      indicatorEl.className = 'pdf-scanner-indicator pdf-scanner-warning-bg';
      
      const iconEl = document.createElement('div');
      iconEl.innerHTML = '⚠️';
      iconEl.className = 'pdf-scanner-indicator-icon';
      
      const messageEl = document.createElement('div');
      messageEl.textContent = errorMessage || 
        `Error scanning "${filename}". Proceeding with caution.`;
      
      const closeEl = this._createIndicatorCloseButton(() => indicatorEl.remove());
      
      indicatorEl.appendChild(iconEl);
      indicatorEl.appendChild(messageEl);
      indicatorEl.appendChild(closeEl);
      document.body.appendChild(indicatorEl);
      
      // No auto-remove for error messages - user must acknowledge
      
    } catch (error) {
      this.logger.error('Error showing scan error indicator:', error);
    }
  }

  /**
   * Add a warning indicator to an attachment element
   * @param {HTMLElement} element - Element representing a PDF attachment
   * @param {Function} onClickCallback - Callback when warning is clicked
   */
  addWarningIndicatorToAttachment(element, onClickCallback) {
    try {
      if (element.querySelector('.pdf-scanner-attachment-warning')) {
        return;
      }
      
      const warningBadge = document.createElement('div');
      warningBadge.className = 'pdf-scanner-attachment-warning';
      warningBadge.textContent = '!';
      warningBadge.title = 'This PDF was scanned for secrets';
      
      // Make sure element has position relative or absolute
      const currentPosition = window.getComputedStyle(element).position;
      if (currentPosition === 'static') {
        element.style.position = 'relative';
      }
      
      warningBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onClickCallback();
      });
      
      element.appendChild(warningBadge);
      
    } catch (error) {
      this.logger.error('Error adding warning indicator to attachment', error);
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
      this.logger.error('Error removing existing indicators:', error);
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
      
      // Clean up any orphaned warnings
      const possibleWarnings = document.querySelectorAll('div[style*="z-index: 10000"]');
      possibleWarnings.forEach(el => {
        if (el.innerHTML.includes('Security Risk Detected')) {
          el.remove();
        }
      });
    } catch (error) {
      this.logger.error('Error removing existing security warnings:', error);
    }
  }

  // ========== Private Helper Methods ==========

  /**
   * Create modal header
   */
  _createModalHeader() {
    const headerEl = document.createElement('div');
    headerEl.className = 'pdf-scanner-modal-header pdf-scanner-error-bg';
    
    const iconEl = document.createElement('div');
    iconEl.innerHTML = '⚠️';
    iconEl.className = 'pdf-scanner-modal-icon';
    
    const titleEl = document.createElement('h2');
    titleEl.textContent = 'Security Risk Detected';
    titleEl.className = 'pdf-scanner-modal-title';
    
    const closeBtn = document.createElement('div');
    closeBtn.innerHTML = '✕';
    closeBtn.className = 'pdf-scanner-modal-close';
    closeBtn.addEventListener('click', () => {
      this.removeExistingSecurityWarnings();
    });
    
    headerEl.appendChild(iconEl);
    headerEl.appendChild(titleEl);
    headerEl.appendChild(closeBtn);
    
    return headerEl;
  }

  /**
   * Create modal content area
   */
  _createModalContent(filename, result) {
    const contentEl = document.createElement('div');
    contentEl.className = 'pdf-scanner-modal-content';
    
    const messageEl = document.createElement('p');
    messageEl.innerHTML = `<strong>The file "${filename}" contains sensitive information that should not be shared with AI models.</strong><br><br>Uploading this file could lead to data leakage.`;
    messageEl.className = 'pdf-scanner-modal-message';
    
    const findingsEl = this._createFindingsSection(result);
    
    contentEl.appendChild(messageEl);
    contentEl.appendChild(findingsEl);
    
    return contentEl;
  }

  /**
   * Create findings section
   */
  _createFindingsSection(result) {
    const findingsEl = document.createElement('div');
    findingsEl.className = 'pdf-scanner-findings-box';
    
    const findingsTitleEl = document.createElement('div');
    findingsTitleEl.textContent = 'Detected sensitive information:';
    findingsTitleEl.className = 'pdf-scanner-findings-title';
    
    const findingsListEl = document.createElement('ul');
    findingsListEl.className = 'pdf-scanner-findings-list';
    
    this._populateFindings(findingsListEl, result);
    
    findingsEl.appendChild(findingsTitleEl);
    findingsEl.appendChild(findingsListEl);
    
    return findingsEl;
  }

  /**
   * Populate findings list
   */
  _populateFindings(listEl, result) {
    if (result && result.findings && result.findings.length > 0) {
      const currentFindings = JSON.parse(JSON.stringify(result.findings));
      
      // Filter out generic non-informative findings
      const meaningfulFindings = currentFindings.filter(finding => {
        const isGenericCount = finding.value && finding.value.includes('detection(s)') && 
                             (finding.type === 'Language Detector' || 
                              finding.type === 'Sensitive Data' || 
                              finding.type === 'Token Limitation');
        return !isGenericCount;
      });
      
      meaningfulFindings.forEach(finding => {
        const findingEl = document.createElement('li');
        findingEl.className = 'pdf-scanner-finding-item';
        
        if (finding.type === 'Secret' && finding.value) {
          let displayText = `<strong>${finding.entity_type || finding.type}</strong>`;
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
          findingEl.innerHTML = `<strong>${finding.type}</strong>: ${finding.value}`;
        } else {
          return; // Skip non-informative findings
        }
        
        listEl.appendChild(findingEl);
      });
      
      if (listEl.children.length === 0) {
        this._addGenericFinding(listEl);
      }
    } else {
      this._addGenericFinding(listEl);
    }
  }

  /**
   * Add generic finding when no specific findings are available
   */
  _addGenericFinding(listEl) {
    const findingEl = document.createElement('li');
    findingEl.textContent = 'Potential sensitive information detected';
    findingEl.className = 'pdf-scanner-finding-item';
    listEl.appendChild(findingEl);
  }

  /**
   * Create indicator close button
   */
  _createIndicatorCloseButton(onClickCallback) {
    const closeEl = document.createElement('button');
    closeEl.textContent = '×';
    closeEl.className = 'pdf-scanner-indicator-close';
    closeEl.addEventListener('click', onClickCallback);
    return closeEl;
  }

  /**
   * Add escape key handler
   */
  _addEscapeHandler(callback) {
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        callback();
        document.removeEventListener('keydown', escHandler);
      }
    };
    
    // Remove existing handler first
    document.removeEventListener('keydown', this._currentEscHandler);
    document.addEventListener('keydown', escHandler);
    this._currentEscHandler = escHandler;
  }

  /**
   * Ensure spinner animation styles are available
   */
  _ensureSpinnerAnimation() {
    if (!document.getElementById('pdf-scanner-spinner-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'pdf-scanner-spinner-styles';
      styleEl.textContent = `
        @keyframes pdf-scanner-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleEl);
    }
  }
}

/**
 * Show a standalone error message (used outside of class context)
 * @param {string} message - Error message to show
 */
function showStandaloneError(message) {
  try {
    const indicatorEl = document.createElement('div');
    indicatorEl.id = 'pdf-scanner-indicator';
    indicatorEl.className = 'pdf-scanner-indicator pdf-scanner-warning-bg';
    
    const iconEl = document.createElement('div');
    iconEl.innerHTML = '⚠️';
    iconEl.className = 'pdf-scanner-indicator-icon';
    
    const messageEl = document.createElement('div');
    messageEl.textContent = message || 'PDF Scanner extension encountered an error. Please refresh the page.';
    
    const closeEl = document.createElement('button');
    closeEl.textContent = '×';
    closeEl.className = 'pdf-scanner-indicator-close';
    closeEl.addEventListener('click', () => indicatorEl.remove());
    
    indicatorEl.appendChild(iconEl);
    indicatorEl.appendChild(messageEl);
    indicatorEl.appendChild(closeEl);
    document.body.appendChild(indicatorEl);
    
  } catch (error) {
    console.error('[PDF Scanner] Error showing standalone error:', error);
  }
} 