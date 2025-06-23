/**
 * Custom error classes and middleware for the inspection service
 */
class AppError extends Error {
  constructor(message, statusCode = 500, validationErrors = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.validationErrors = validationErrors;
    this.code = code;
    this.name = 'AppError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  toResponse() {
    const response = {
      ok: false,
      error: {
        message: this.message,
        status: this.statusCode,
      }
    };
    
    if (this.code) {
      response.error.code = this.code;
    }
    
    if (this.validationErrors) {
      response.error.validationErrors = this.validationErrors;
    }
    
    return response;
  }
}

/**
 * Express error handler middleware
 */
function expressErrorHandler(err, req, res, next) {
  const logger = require('../utils/logger.js') || console;
  
  logger.error('Error:', err.message);
  if (err.stack) {
    logger.error(err.stack);
  }
  
  let response;
  if (err instanceof AppError) {
    response = err.toResponse();
  } else {
    response = {
      ok: false,
      error: {
        message: err.message || 'Internal Server Error',
        status: err.statusCode || 500,
        code: err.code || 'INTERNAL_ERROR'
      }
    };
  }
  
  res.status(response.error.status).json(response);
}

module.exports = {
  errorHandler: expressErrorHandler,
  AppError,
};
