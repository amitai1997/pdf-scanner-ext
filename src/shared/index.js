/**
 * Shared utilities index
 * Central export for all shared modules
 */

// Constants
export * from './constants.js';

// PDF Detection utilities
export * from './pdfDetection.js';

// Hash utilities
export * from './hashUtils.js';

// Logger utilities
export * from './logger.js';

// Error handling utilities
export * from './errors.js';

// For CommonJS compatibility (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  const constants = require('./constants.js');
  const pdfDetection = require('./pdfDetection.js');
  const hashUtils = require('./hashUtils.js');
  const logger = require('./logger.js');
  const errors = require('./errors.js');
  
  module.exports = {
    ...constants,
    ...pdfDetection,
    ...hashUtils,
    ...logger,
    ...errors,
  };
} 