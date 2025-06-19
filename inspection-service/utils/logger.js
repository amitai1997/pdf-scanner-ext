/**
 * Console logger used by the inspection service.
 * Supports basic level filtering.
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

class Logger {
  constructor(level = 'info') {
    this.level = LOG_LEVELS[level] || LOG_LEVELS.info;
    this.serviceName = 'PDF-Scanner-Service';
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
    const prefix = `${timestamp} [${this.serviceName}] [${level.toUpperCase()}]`;
    
    if (data !== null && data !== undefined) {
      return `${prefix} ${message}`;
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
      if (data !== null && data !== undefined) {
        console.error(this.formatMessage('error', message), data);
      } else {
        console.error(this.formatMessage('error', message));
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
      if (data !== null && data !== undefined) {
        console.warn(this.formatMessage('warn', message), data);
      } else {
        console.warn(this.formatMessage('warn', message));
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
      if (data !== null && data !== undefined) {
        console.log(this.formatMessage('info', message), data);
      } else {
        console.log(this.formatMessage('info', message));
      }
    }
  }

  /**
   * Log debug message
   * @param {string} message - Debug message
   * @param {any} data - Optional debug data
   */
  debug(message, data = null) {
    if (this.level >= LOG_LEVELS.debug) {
      if (data !== null && data !== undefined) {
        console.log(this.formatMessage('debug', message), data);
      } else {
        console.log(this.formatMessage('debug', message));
      }
    }
  }

  /**
   * Log an HTTP request
   * @param {Object} req - Express request object
   */
  logRequest(req) {
    if (this.level >= LOG_LEVELS.info) {
      const message = `${req.method} ${req.originalUrl}`;
      this.info(message);
    }
  }

  /**
   * Log scan operation
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

  /**
   * Log structured PDF debug information
   * @param {object} data - Debug metadata
   */
  debugPDF(data) {
    if (this.level >= LOG_LEVELS.debug) {
      console.log(this.formatMessage('debug', 'PDF Debug Entry'));
      console.table(data);
    }
  }
}

// Create default logger instance
const logger = new Logger(process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'));

module.exports = logger; 