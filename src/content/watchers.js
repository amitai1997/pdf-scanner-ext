// Dependencies loaded via manifest.json script order
function startMonitoring() {
  try {
    // Initial scan for existing file inputs
    this.scanForFileInputs();

    // Set up mutation observer to detect dynamically added file inputs
    this.observer = new MutationObserver((mutations) => {
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
      subtree: true,
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
 * Process a PDF file - common logic for all file detection methods
 * @param {File} file - The PDF file to process
 * @param {Object} options - Processing options
 * @param {boolean} options.preventUpload - Whether to try to prevent upload on secrets detection
 * @param {HTMLInputElement} options.fileInput - The input element (for upload prevention)
 */
function processPDFFile(file, options = {}) {
  try {
    // Show scanning indicator to user immediately
    this.ui.showScanningIndicator(file.name);

    // Immediate scan of the PDF
    this.scanPDFImmediately(file)
      .then((result) => {
        logger.log('Immediate scan result:', result);

        if (result.secrets) {
          // If secrets found, show warning
          this.ui.showSecretWarning(file.name, result);

          // Try to prevent upload if requested and we have a file input
          if (options.preventUpload && options.fileInput) {
            this.preventFileUpload(options.fileInput, file);
          }
        } else if (result.extractionError || result.note === 'PDF parsing failed') {
          // Parsing failed: show scan error indicator
          logger.log('PDF parsing failed – showing scan error indicator');
          this.ui.showScanErrorIndicator(file.name, 'No text could be extracted from this file.');
        } else if (result.action === 'warn') {
          // Generic warn actions (e.g. large file, partial scan) – show modal for more detail
          this.ui.showParsingWarning(file.name, result);
        } else {
          // Only show safe indicator if no secrets AND no warnings/errors
          this.ui.showSafeFileIndicator(file.name);
        }
      })
      .catch((error) => {
        logger.error('Error during immediate scan of PDF', error);
        this.ui.showParsingWarning(file.name, { 
          note: `Scan error: ${error.message}`,
          extractionError: true 
        });
      });

    // Also track the upload through our normal channels as backup
    this.trackUpload(file);
  } catch (error) {
    logger.error('Error processing PDF file', { error: error.message, filename: file.name });
  }
}

/**
 * Prevent file upload by clearing input and attempting other methods
 * @param {HTMLInputElement} input - The file input element
 * @param {File} file - The file that was detected with secrets
 */
function preventFileUpload(input, file) {
  try {
    // Method 1: Clear the file input
    input.value = '';

    // Method 2: Try to clear the files property (may not work in all browsers)
    try {
      Object.defineProperty(input, 'files', {
        value: null,
        writable: false
      });
    } catch (e) {
      // FileList constructor not available, try alternative approach
      try {
        // Create a new file input element and copy its empty files
        const tempInput = document.createElement('input');
        tempInput.type = 'file';
        Object.defineProperty(input, 'files', {
          value: tempInput.files,
          writable: false
        });
      } catch (e2) {
        logger.log('Could not modify files property, relying on other methods');
      }
    }

    // Method 3: Dispatch change event to notify the app that the file was removed
    const changeEvent = new Event('change', { bubbles: true });
    input.dispatchEvent(changeEvent);

    // Method 4: Try to prevent form submission if we can find the form
    const form = input.closest('form');
    if (form) {
      const preventSubmit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        logger.log('Prevented form submission due to secrets in PDF');
        return false;
      };
      
      // Add temporary listener to prevent submission
      form.addEventListener('submit', preventSubmit, { once: true, capture: true });
      
      // Remove the listener after 30 seconds to avoid permanent blocking
      setTimeout(() => {
        form.removeEventListener('submit', preventSubmit, { capture: true });
      }, 30000);
    }

    // Method 5: Try to remove any visible file attachments from the UI
    setTimeout(() => {
      try {
        const attachments = document.querySelectorAll('[data-testid="attachment"]');
        attachments.forEach(attachment => {
          if (attachment.textContent && attachment.textContent.includes(file.name)) {
            logger.log('Removing file attachment from UI:', file.name);
            attachment.remove();
          }
        });
      } catch (e) {
        logger.error('Error removing file attachment from UI', e);
      }
    }, 100);

    logger.log('Cleared file input after detecting secrets');
  } catch (error) {
    logger.error('Error preventing file upload', { error: error.message, filename: file.name });
  }
}

/**
 * Check for ChatGPT-specific file upload elements
 */
function checkForChatGPTFileElements() {
  try {
    // ChatGPT has a specific file upload button
    const fileButtons = document.querySelectorAll(
      'button[aria-label*="upload"], button[aria-label*="attach"], button[aria-label*="file"]'
    );

    fileButtons.forEach((button) => {
      if (!button._pdfScannerMonitored) {
        button._pdfScannerMonitored = true;
        button.addEventListener('click', () => {
          logger.log('ChatGPT file upload button clicked');
          // The actual file input will be detected by our other monitoring

          // Find any hidden file inputs that might be triggered by this button
          // This is a common pattern in modern web apps
          const nearbyFileInputs = document.querySelectorAll('input[type="file"]');
          nearbyFileInputs.forEach((input) => {
            if (!input._pdfScannerClickMonitored) {
              input._pdfScannerClickMonitored = true;

              // Create a MutationObserver to detect when files are added to this input
              const observer = new MutationObserver((mutations) => {
                if (input.files && input.files.length > 0) {
                  logger.log('Files added to input via ChatGPT UI');
                  // Manually trigger our handler
                  this.handleFileInputChange({ target: input });
                }
              });

              // Observe the input for changes
              observer.observe(input, {
                attributes: true,
                attributeFilter: ['files'],
              });

              logger.log('Added mutation observer to file input');
            }
          });
        });
      }
    });

    // Look for file attachments already in the UI
    const attachmentElements = document.querySelectorAll(
      '[data-testid*="attachment"], [class*="attachment"], [class*="file-attachment"]'
    );

    attachmentElements.forEach((element) => {
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
            ariaLabel: element.getAttribute('aria-label'),
          });

          // Report to background script
          this.sendMessage({
            type: 'pdf_detected_in_ui',
            details: {
              text: element.textContent,
              ariaLabel: element.getAttribute('aria-label'),
            },
          }).catch((err) => {
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
    filePickers.forEach((dialog) => {
      if (
        !dialog._pdfScannerMonitored &&
        (dialog.textContent?.includes('Upload') ||
          dialog.textContent?.includes('File') ||
          dialog.textContent?.includes('Attach'))
      ) {
        dialog._pdfScannerMonitored = true;
        logger.log('Found ChatGPT file picker dialog');

        // Find any file inputs inside the dialog
        const fileInputs = dialog.querySelectorAll('input[type="file"]');
        fileInputs.forEach((input) => {
          if (!this.fileInputs.has(input)) {
            this.fileInputs.add(input);
            input.addEventListener('change', this.handleFileInputChange.bind(this));
            logger.log('Added event listener to file input in dialog');
          }
        });

        // Monitor for new file inputs being added to the dialog
        const dialogObserver = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length) {
              // Check if any of the added nodes are file inputs or contain file inputs
              for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const newInputs = node.querySelectorAll
                    ? node.querySelectorAll('input[type="file"]')
                    : [];

                  if (newInputs.length > 0) {
                    logger.log('New file inputs added to dialog');
                    newInputs.forEach((input) => {
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
          subtree: true,
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
function addWarningIndicatorToAttachment(element) {
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

      this.ui.showSecretWarning('Unknown PDF', {
        secrets: true,
        findings: [{ type: 'POTENTIAL_RISK', confidence: 0.8 }],
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
function setupDragAndDropMonitoring() {
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
        const pdfFiles = files.filter((file) => PDFMonitor._isPdfCandidate(file));

        if (pdfFiles.length > 0) {
          logger.log('PDF files dropped', {
            count: pdfFiles.length,
            names: pdfFiles.map((f) => f.name),
          });

          // Process each dropped PDF file
          pdfFiles.forEach((file) => {
            this.processPDFFile(file);
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
function setupClipboardMonitoring() {
  try {
    document.addEventListener('paste', (event) => {
      if (event.clipboardData && event.clipboardData.files) {
        const files = Array.from(event.clipboardData.files);
        const pdfFiles = files.filter((file) => PDFMonitor._isPdfCandidate(file));

        if (pdfFiles.length > 0) {
          logger.log('PDF files pasted from clipboard', {
            count: pdfFiles.length,
            names: pdfFiles.map((f) => f.name),
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
          pdfFiles.forEach((file) => {
            this.processPDFFile(file);
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
function monitorFileSelectionDialog() {
  try {
    // Override the native file input click method
    const originalClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
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
function stopMonitoring() {
  try {
    if (this.observer) {
      this.observer.disconnect();
    }

    // Remove all event listeners
    this.fileInputs.forEach((input) => {
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
function scanForFileInputs() {
  try {
    const fileInputs = document.querySelectorAll('input[type="file"]');

    fileInputs.forEach((input) => {
      if (!this.fileInputs.has(input)) {
        // New file input found
        this.fileInputs.add(input);

        // Bind change event
        this.fileInputChangeHandler = this.handleFileInputChange.bind(this);
        input.addEventListener('change', this.fileInputChangeHandler);

        logger.log('Found new file input', {
          id: input.id,
          name: input.name,
          accept: input.accept,
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
function setupFormSubmissionMonitoring() {
  try {
    // Find all forms and add submit listener
    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('submit', this.handleFormSubmit.bind(this));
    });

    // Also monitor all buttons that might trigger uploads
    document.querySelectorAll('button, [role="button"]').forEach((button) => {
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
function handleFileInputChange(event) {
  try {
    const input = event.target;
    const files = Array.from(input.files || []);

    // Filter for PDF files using shared logic
    const pdfFiles = files.filter((file) => PDFMonitor._isPdfCandidate(file));

    if (pdfFiles.length === 0) {
      return;
    }

    logger.log('PDF files selected', {
      count: pdfFiles.length,
      names: pdfFiles.map((f) => f.name),
    });

    // Process each selected PDF file
    pdfFiles.forEach((file) => {
      this.processPDFFile(file, {
        preventUpload: true,
        fileInput: input
      });
    });
  } catch (error) {
    logger.error('Error handling file input change', { error: error.message });
  }
}

/**
 * Handle form submission
 * @param {Event} event - Submit event
 */
function handleFormSubmit(event) {
  try {
    const form = event.target;

    // Check if form has any file inputs with PDFs
    const fileInputs = form.querySelectorAll('input[type="file"]');
    let hasPDF = false;

    fileInputs.forEach((input) => {
      const files = Array.from(input.files || []);
      hasPDF = hasPDF || files.some((file) => PDFMonitor._isPdfCandidate(file));
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
function handleButtonClick(event) {
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
        ariaLabel: button.getAttribute('aria-label'),
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
function trackUpload(file) {
  try {
    const fileId = `${file.name}-${file.size}-${Date.now()}`;

    this.uploadState.activeUploads.add(fileId);

    logger.log('Tracking file upload', {
      fileId,
      filename: file.name,
      size: file.size,
    });

    // Notify background about potential upcoming upload
    this.sendMessage({
      type: 'pdf_selected',
      fileId,
      filename: file.name,
      size: file.size,
      timestamp: Date.now(),
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
          fileData: base64data,
        }).catch((err) => {
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
