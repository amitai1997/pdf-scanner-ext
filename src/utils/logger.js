/**
 * PDF Scanner Extension - Logger Utility
 * Provides consistent logging across all extension components
 */

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
      // Silent fail
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
      // Silent fail
    }
  }
};

// Export for module contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = logger;
}

// Export for ES6 modules
export default logger;

// Make available in service worker context
if (typeof self !== 'undefined') {
  self.logger = logger;
} 