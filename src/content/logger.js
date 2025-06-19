// Dependencies loaded via manifest.json script order

let logger;
try {
  // Try to use shared logger if available
  if (typeof Logger !== 'undefined') {
    logger = new Logger({ prefix: '[PDF Scanner]' });
  } else {
    throw new Error('Logger not available');
  }
} catch (e) {
  logger = {
    log(msg, data) {
      try {
        data !== undefined
          ? console.log(`[PDF Scanner] ${msg}`, data)
          : console.log(`[PDF Scanner] ${msg}`);
      } catch {}
    },
    warn(msg, data) {
      try {
        data !== undefined
          ? console.warn(`[PDF Scanner] WARNING: ${msg}`, data)
          : console.warn(`[PDF Scanner] WARNING: ${msg}`);
      } catch {}
    },
    error(msg, data) {
      try {
        data !== undefined
          ? console.error(`[PDF Scanner] ERROR: ${msg}`, data)
          : console.error(`[PDF Scanner] ERROR: ${msg}`);
      } catch {}
    },
    info(msg, data) {
      this.log(msg, data);
    },
    debug(msg, data) {
      this.log(msg, data);
    },
  };
}

// logger is now globally available
