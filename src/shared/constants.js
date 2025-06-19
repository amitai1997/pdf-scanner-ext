/**
 * Constants used by both the extension and the
 * inspection service.
 */

export const PDF_CONSTANTS = {
  // File size limits
  MAX_PDF_SIZE: 20 * 1024 * 1024, // 20MB
  MAX_PDF_SIZE_MB: 20,
  
  // MIME types for PDF detection
  PDF_MIME_TYPES: [
    'application/pdf',
    'application/x-pdf',
    'application/acrobat',
    'application/vnd.pdf',
  ],
  
  // Timeouts
  SCAN_TIMEOUT: 10000, // 10 seconds
  NOTIFICATION_DURATION: 5000, // 5 seconds
  
  // Cache settings
  SCAN_CACHE_SIZE: 100,
  CLEANUP_DELAY: 5 * 60 * 1000, // 5 minutes
};

export const UI_CONSTANTS = {
  // Z-index values for consistent layering
  Z_INDEX: {
    WARNING_MODAL: 10000,
    INDICATOR: 9999,
    ATTACHMENT_WARNING: 1000,
  },
  
  // Colors for consistent theming
  COLORS: {
    ERROR: '#d32f2f',
    WARNING: '#ffc107',
    SUCCESS: '#4caf50',
    INFO: '#2196f3',
    GRAY: '#f8f9fa',
    TEXT: '#333',
  },
  
  // Spacing and sizes
  SPACING: {
    SMALL: '8px',
    MEDIUM: '16px',
    LARGE: '24px',
  },
};

// For CommonJS compatibility (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PDF_CONSTANTS, UI_CONSTANTS };
} 