const { expressErrorHandler, AppError } = require('../../src/shared/errors.js');

module.exports = {
  errorHandler: expressErrorHandler,
  AppError,
};
