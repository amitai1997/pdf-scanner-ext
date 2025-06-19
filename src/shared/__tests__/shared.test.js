/**
 * Unit tests for shared utilities
 * These tests verify the consolidated utilities work correctly
 */

import { 
  PDF_CONSTANTS, 
  UI_CONSTANTS,
  isPdfCandidate,
  checkIfBodyContainsPDF,
  isBase64PDF,
  isFileTooLarge,
  computeHashBrowser,
  createSimpleLogger,
  AppError,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES 
} from '../index.js';

describe('PDF Scanner Shared Utilities', () => {
  
  describe('Constants', () => {
    test('PDF_CONSTANTS should have correct values', () => {
      expect(PDF_CONSTANTS.MAX_PDF_SIZE).toBe(20 * 1024 * 1024);
      expect(PDF_CONSTANTS.MAX_PDF_SIZE_MB).toBe(20);
      expect(PDF_CONSTANTS.PDF_MIME_TYPES).toContain('application/pdf');
      expect(PDF_CONSTANTS.SCAN_TIMEOUT).toBe(10000);
    });

    test('UI_CONSTANTS should have correct values', () => {
      expect(UI_CONSTANTS.Z_INDEX.WARNING_MODAL).toBe(10000);
      expect(UI_CONSTANTS.Z_INDEX.INDICATOR).toBe(9999);
      expect(UI_CONSTANTS.COLORS.ERROR).toBe('#d32f2f');
      expect(UI_CONSTANTS.COLORS.SUCCESS).toBe('#4caf50');
    });
  });

  describe('PDF Detection', () => {
    test('isPdfCandidate should detect PDF files correctly', () => {
      // Mock PDF file
      const pdfFile = { type: 'application/pdf', name: 'test.pdf' };
      expect(isPdfCandidate(pdfFile)).toBe(true);

      // Mock non-PDF file
      const textFile = { type: 'text/plain', name: 'test.txt' };
      expect(isPdfCandidate(textFile)).toBe(false);

      // Null/undefined
      expect(isPdfCandidate(null)).toBe(false);
      expect(isPdfCandidate(undefined)).toBe(false);

      // File with PDF extension but no MIME type
      const pdfByName = { name: 'document.pdf' };
      expect(isPdfCandidate(pdfByName)).toBe(true);
    });

    test('checkIfBodyContainsPDF should detect PDFs in various formats', () => {
      // String with PDF indicators
      expect(checkIfBodyContainsPDF('application/pdf')).toBe(true);
      expect(checkIfBodyContainsPDF('data:application/pdf;base64,JVBERi')).toBe(true);
      expect(checkIfBodyContainsPDF('document.pdf')).toBe(true);
      expect(checkIfBodyContainsPDF('regular text')).toBe(false);

      // Null/empty
      expect(checkIfBodyContainsPDF(null)).toBe(false);
      expect(checkIfBodyContainsPDF('')).toBe(false);
    });

    test('isBase64PDF should detect base64 PDF data', () => {
      // Valid base64 PDF data URL
      expect(isBase64PDF('data:application/pdf;base64,JVBERi0xLjM=')).toBe(true);
      
      // Short base64 strings should return false
      expect(isBase64PDF('JVBERi0xLjM=')).toBe(false);
      
      // Invalid data
      expect(isBase64PDF('not-base64')).toBe(false);
      expect(isBase64PDF('')).toBe(false);
      expect(isBase64PDF('SGVsbG8gV29ybGQ=')).toBe(false); // "Hello World" in base64
    });

    test('isFileTooLarge should check file size limits', () => {
      expect(isFileTooLarge(10 * 1024 * 1024)).toBe(false); // 10MB
      expect(isFileTooLarge(25 * 1024 * 1024)).toBe(true);  // 25MB
      expect(isFileTooLarge(0)).toBe(false);
    });
  });

  describe('Hash Utils', () => {
    test('computeHashBrowser should handle various inputs', async () => {
      // Valid base64
      const validBase64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
      const hash = await computeHashBrowser(validBase64);
      expect(typeof hash).toBe('string');
      expect(hash).toHaveLength(64); // SHA-256 hex string length

      // Invalid input should return empty string hash
      const emptyHash = await computeHashBrowser('');
      expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('Logger', () => {
    test('createSimpleLogger should create a logger with correct methods', () => {
      const logger = createSimpleLogger({ prefix: '[Test]' });
      
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('Error Handling', () => {
    test('AppError should create proper error objects', () => {
      const error = new AppError('Test error', 400, null, 'TEST_ERROR');
      
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('AppError');
    });

    test('createErrorResponse should create standardized error responses', () => {
      const response = createErrorResponse('Test error', 400, 'TEST_ERROR');
      
      expect(response.ok).toBe(false);
      expect(response.error.message).toBe('Test error');
      expect(response.error.status).toBe(400);
      expect(response.error.code).toBe('TEST_ERROR');
    });

    test('createSuccessResponse should create standardized success responses', () => {
      const data = { result: 'success' };
      const response = createSuccessResponse(data, 'Operation completed');
      
      expect(response.ok).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.message).toBe('Operation completed');
    });

    test('ERROR_CODES should contain expected codes', () => {
      expect(ERROR_CODES.PDF_NOT_PROVIDED).toBe('PDF_NOT_PROVIDED');
      expect(ERROR_CODES.PDF_TOO_LARGE).toBe('PDF_TOO_LARGE');
      expect(ERROR_CODES.SCAN_ERROR).toBe('SCAN_ERROR');
      expect(ERROR_CODES.CHROME_RUNTIME_ERROR).toBe('CHROME_RUNTIME_ERROR');
    });
  });
});

// Mock global objects for testing in Node.js environment
global.atob = global.atob || ((str) => Buffer.from(str, 'base64').toString('binary'));
global.crypto = global.crypto || {
  subtle: {
    digest: async (algorithm, data) => {
      const crypto = require('crypto');
      return crypto.createHash(algorithm.toLowerCase().replace('-', '')).update(data).digest();
    }
  }
}; 