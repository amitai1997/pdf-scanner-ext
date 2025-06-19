/** Isomorphic logger with colour, level filtering and Node/Browser adaptation. */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

/**
 * Universal logger class that adapts to different environments
 */
export class Logger {
  constructor(options = {}) {
    const {
      level = 'info',
      serviceName = 'PDF-Scanner',
      prefix = '[PDF Scanner]',
      enableColors = true,
    } = options;
    
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
    this.serviceName = serviceName;
    this.prefix = prefix;
    this.enableColors = enableColors;
    
    // Detect environment
    this.isNode = typeof require !== 'undefined' && typeof window === 'undefined';
    this.isBrowser = typeof window !== 'undefined';
  }

  /**
   * Set logging level
   * @param {string} level - Log level (error, warn, info, debug)
   */
  setLevel(level) {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
  }

  /**
   * Format log message with timestamp and level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {any} data - Optional data to log
   * @returns {string} Formatted message
   */
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    let prefix;
    
    if (this.isNode) {
      // Node.js format with service name
      prefix = `${timestamp} [${this.serviceName}] [${level.toUpperCase()}]`;
    } else {
      // Browser format with simple prefix
      prefix = `${this.prefix}`;
      if (level !== 'info') {
        prefix += ` ${level.toUpperCase()}:`;
      }
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
   * Log an HTTP request (Node.js specific)
   * @param {Object} req - Express request object
   */
  logRequest(req) {
    if (this.isNode && this.level >= LOG_LEVELS.info) {
      const message = `${req.method} ${req.originalUrl}`;
      this.info(message);
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
export function createSimpleLogger(options = {}) {
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
 * Default logger instances for different contexts
 */
export const extensionLogger = createSimpleLogger({
  prefix: '[PDF Scanner]',
  level: 'info'
});

export const serviceLogger = new Logger({
  serviceName: 'PDF-Scanner-Service',
  level: process?.env?.LOG_LEVEL || (process?.env?.NODE_ENV === 'development' ? 'debug' : 'info')
});

// For CommonJS compatibility (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Logger,
    createSimpleLogger,
    extensionLogger,
    serviceLogger,
  };
} 