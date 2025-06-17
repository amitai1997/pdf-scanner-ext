/**
 * Global error handler for the PDF inspection service
 */

class AppError extends Error {
  constructor(message, statusCode = 500, validationErrors = null) {
    super(message);
    this.statusCode = statusCode;
    this.validationErrors = validationErrors;
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  // Log the error
  console.error('Error:', err.message);
  console.error(err.stack);

  // Set appropriate status code
  const statusCode = err.statusCode || 500;

  // Prepare error response
  const errorResponse = {
    error: {
      message: err.message || 'Internal Server Error',
      status: statusCode
    }
  };

  // Add validation errors if available
  if (err.validationErrors) {
    errorResponse.error.validationErrors = err.validationErrors;
  }

  // Send response
  res.status(statusCode).json(errorResponse);
};

module.exports = { errorHandler, AppError }; 