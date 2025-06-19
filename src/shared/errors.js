/** Domain error classes plus helpers to create consistent JSON responses. */

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, validationErrors = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.validationErrors = validationErrors;
    this.code = code;
    this.name = 'AppError';
    
    // Capture stack trace if available
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Convert to standardized error response
   * @returns {Object} Standardized error response
   */
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
 * Create a standardized error response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status code
 * @param {string} code - Error code
 * @param {any} validationErrors - Validation errors
 * @returns {Object} Standardized error response
 */
export function createErrorResponse(message, statusCode = 500, code = null, validationErrors = null) {
  const response = {
    ok: false,
    error: {
      message: message || 'Internal Server Error',
      status: statusCode
    }
  };
  
  if (code) {
    response.error.code = code;
  }
  
  if (validationErrors) {
    response.error.validationErrors = validationErrors;
  }
  
  return response;
}

/**
 * Create a standardized success response
 * @param {any} data - Response data
 * @param {string} message - Success message
 * @returns {Object} Standardized success response
 */
export function createSuccessResponse(data, message = null) {
  const response = {
    ok: true,
    data
  };
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

/**
 * Convert Chrome runtime error to standardized format
 * @param {Object} chromeError - Chrome runtime error
 * @returns {Object} Standardized error response
 */
export function fromChromeError(chromeError) {
  return createErrorResponse(
    chromeError.message || 'Extension error',
    500,
    'CHROME_RUNTIME_ERROR'
  );
}

/**
 * Convert fetch error to standardized format
 * @param {Error} fetchError - Fetch error
 * @param {Response} response - Fetch response (optional)
 * @returns {Object} Standardized error response
 */
export function fromFetchError(fetchError, response = null) {
  let statusCode = 500;
  let code = 'FETCH_ERROR';
  
  if (response) {
    statusCode = response.status;
    if (statusCode >= 400 && statusCode < 500) {
      code = 'CLIENT_ERROR';
    } else if (statusCode >= 500) {
      code = 'SERVER_ERROR';
    }
  }
  
  return createErrorResponse(
    fetchError.message || 'Network error',
    statusCode,
    code
  );
}

/**
 * Express error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function expressErrorHandler(err, req, res, next) {
  // Import logger dynamically to avoid circular dependencies
  const logger = require('./logger.js').serviceLogger || console;
  
  // Log the error
  logger.error('Error:', err.message);
  if (err.stack) {
    logger.error(err.stack);
  }
  
  let response;
  if (err instanceof AppError) {
    response = err.toResponse();
  } else {
    // Convert generic error to AppError format
    response = createErrorResponse(
      err.message || 'Internal Server Error',
      err.statusCode || 500,
      err.code || 'INTERNAL_ERROR'
    );
  }
  
  // Send response
  res.status(response.error.status).json(response);
}

/**
 * Chrome extension message error handler
 * @param {Error} error - Error object
 * @param {Function} sendResponse - Chrome sendResponse function
 */
export function chromeMessageErrorHandler(error, sendResponse) {
  const response = error instanceof AppError ? 
    error.toResponse() : 
    createErrorResponse(error.message || 'Unknown error', 500, 'MESSAGE_ERROR');
    
  sendResponse(response);
}

/**
 * Common error codes for the application
 */
export const ERROR_CODES = {
  // General errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // PDF-specific errors
  PDF_NOT_PROVIDED: 'PDF_NOT_PROVIDED',
  PDF_TOO_LARGE: 'PDF_TOO_LARGE',
  PDF_PARSE_ERROR: 'PDF_PARSE_ERROR',
  PDF_EMPTY: 'PDF_EMPTY',
  
  // Extension-specific errors
  CHROME_RUNTIME_ERROR: 'CHROME_RUNTIME_ERROR',
  EXTENSION_CONTEXT_INVALID: 'EXTENSION_CONTEXT_INVALID',
  MESSAGE_ERROR: 'MESSAGE_ERROR',
  
  // Network errors
  FETCH_ERROR: 'FETCH_ERROR',
  CLIENT_ERROR: 'CLIENT_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',
  
  // Scan errors
  SCAN_ERROR: 'SCAN_ERROR',
  SCAN_TIMEOUT: 'SCAN_TIMEOUT',
};

// For CommonJS compatibility (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AppError,
    createErrorResponse,
    createSuccessResponse,
    fromChromeError,
    fromFetchError,
    expressErrorHandler,
    chromeMessageErrorHandler,
    ERROR_CODES,
  };
} 