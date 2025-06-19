import { Logger } from '../shared/logger.js';

let logger;
try {
  logger = new Logger({ prefix: '[PDF Scanner]' });
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

export { logger };
