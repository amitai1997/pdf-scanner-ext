/**
 * Simple logger for the inspection service
 */
class Logger {
  constructor(options = {}) {
    const {
      level = 'info',
      serviceName = 'PDF-Scanner-Service',
    } = options;
    
    this.serviceName = serviceName;
    this.level = { error: 0, warn: 1, info: 2, debug: 3 }[level] || 2;
  }

  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${this.serviceName}] [${level.toUpperCase()}] ${message}`;
  }

  error(message, data = null) {
    if (this.level >= 0) {
      const formatted = this.formatMessage('error', message);
      if (data !== null && data !== undefined) {
        console.error(formatted, data);
      } else {
        console.error(formatted);
      }
    }
  }

  warn(message, data = null) {
    if (this.level >= 1) {
      const formatted = this.formatMessage('warn', message);
      if (data !== null && data !== undefined) {
        console.warn(formatted, data);
      } else {
        console.warn(formatted);
      }
    }
  }

  info(message, data = null) {
    if (this.level >= 2) {
      const formatted = this.formatMessage('info', message);
      if (data !== null && data !== undefined) {
        console.log(formatted, data);
      } else {
        console.log(formatted);
      }
    }
  }

  log(message, data = null) {
    this.info(message, data);
  }

  debug(message, data = null) {
    if (this.level >= 3) {
      const formatted = this.formatMessage('debug', message);
      if (data !== null && data !== undefined) {
        console.log(formatted, data);
      } else {
        console.log(formatted);
      }
    }
  }

  logRequest(req) {
    if (this.level >= 2) {
      const message = `${req.method} ${req.originalUrl || req.url}`;
      this.info(message);
    }
  }
}

const serviceLogger = new Logger({
  serviceName: 'PDF-Scanner-Service',
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info')
});

module.exports = serviceLogger;
