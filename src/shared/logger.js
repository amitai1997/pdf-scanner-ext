/**
 * Extension-aware logger with level filtering
 * for browser extension contexts (content scripts, background, popup, service workers).
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

/**
 * Extension logger class for browser extension contexts
 */
class Logger {
  constructor(options = {}) {
    const {
      level = 'info',
      prefix = '[PDF Scanner]',
      enableColors = true,
    } = options;
    
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
    this.prefix = prefix;
    this.enableColors = enableColors;
  }

  /**
   * Set logging level
   * @param {string} level - Log level (error, warn, info, debug)
   */
  setLevel(level) {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
  }

  /**
   * Format log message with prefix and level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @returns {string} Formatted message
   */
  formatMessage(level, message) {
    let prefix = this.prefix;
    if (level !== 'info') {
      prefix += ` ${level.toUpperCase()}:`;
    }
    return `${prefix} ${message}`;
  }

  /**
   * Log error message
   * @param {string} message - Error message
   * @param {any} data - Optional error data
   */
  error(message, data = null) {
    if (this.level >= LOG_LEVELS.error) {
      const formattedMessage = this.formatMessage('error', message);
      if (data !== null && data !== undefined) {
        console.error(formattedMessage, data);
      } else {
        console.error(formattedMessage);
      }
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {any} data - Optional warning data
   */
  warn(message, data = null) {
    if (this.level >= LOG_LEVELS.warn) {
      const formattedMessage = this.formatMessage('warn', message);
      if (data !== null && data !== undefined) {
        console.warn(formattedMessage, data);
      } else {
        console.warn(formattedMessage);
      }
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {any} data - Optional info data
   */
  info(message, data = null) {
    if (this.level >= LOG_LEVELS.info) {
      const formattedMessage = this.formatMessage('info', message);
      if (data !== null && data !== undefined) {
        console.log(formattedMessage, data);
      } else {
        console.log(formattedMessage);
      }
    }
  }
  
  /**
   * Alias for info (commonly used in extension contexts)
   * @param {string} message - Log message
   * @param {any} data - Optional data
   */
  log(message, data = null) {
    this.info(message, data);
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {any} data - Optional debug data
   */
  debug(message, data = null) {
    if (this.level >= LOG_LEVELS.debug) {
      const formattedMessage = this.formatMessage('debug', message);
      if (data !== null && data !== undefined) {
        console.log(formattedMessage, data);
      } else {
        console.log(formattedMessage);
      }
    }
  }

  /**
   * Log scan operation (PDF Scanner specific)
   * @param {string} filename - PDF filename
   * @param {number} size - File size
   * @param {string} operation - Operation type
   * @param {any} result - Operation result
   */
  logScan(filename, size, operation, result = null) {
    const message = `PDF ${operation}: ${filename} (${size} bytes)`;
    if (result && result.secrets) {
      this.warn(message, { secretsFound: true, findings: result.findings?.length || 0 });
    } else {
      this.info(message, { secretsFound: false });
    }
  }
}

/**
 * Create a simple logger interface for environments that don't need the full class
 * @param {Object} options - Logger options
 * @returns {Object} - Simple logger interface
 */
function createSimpleLogger(options = {}) {
  const logger = new Logger(options);
  
  return {
    log: (message, data) => logger.log(message, data),
    info: (message, data) => logger.info(message, data),
    warn: (message, data) => logger.warn(message, data),
    error: (message, data) => logger.error(message, data),
    debug: (message, data) => logger.debug(message, data),
  };
}

/**
 * Default logger instance for extension contexts
 */
const extensionLogger = createSimpleLogger({
  prefix: '[PDF Scanner]',
  level: 'info'
});

// Create global logger for browser content scripts
if (typeof window !== 'undefined') {
  // Browser environment - create global logger instance
  window.logger = createSimpleLogger({
    prefix: '[PDF Scanner]',
    level: 'info'
  });
}

// For service worker context - make extensionLogger available globally
if (typeof self !== 'undefined' && typeof importScripts !== 'undefined') {
  // Service worker environment
  self.extensionLogger = extensionLogger;
}

// For CommonJS compatibility (extension contexts)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Logger,
    createSimpleLogger,
    extensionLogger,
  };
} 