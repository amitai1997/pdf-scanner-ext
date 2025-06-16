/**
 * Tests for FormDataParser utility
 * 
 * Note: These tests should be run in a browser or Node.js environment
 * with the FormDataParser class already loaded.
 */

// Mock logger for tests
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Store original logger if it exists
let originalLogger;
if (typeof self !== 'undefined') {
  originalLogger = self.logger;
  self.logger = mockLogger;
} else if (typeof window !== 'undefined') {
  originalLogger = window.logger;
  window.logger = mockLogger;
}

describe('FormDataParser', () => {
  beforeEach(() => {
    // Reset mocks
    mockLogger.log.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
  });
  
  afterAll(() => {
    // Restore original logger
    if (typeof self !== 'undefined' && originalLogger) {
      self.logger = originalLogger;
    } else if (typeof window !== 'undefined' && originalLogger) {
      window.logger = originalLogger;
    }
  });
  
  describe('extractBoundaryFromContentType', () => {
    it('should extract boundary from Content-Type header', () => {
      const contentType = 'multipart/form-data; boundary=----WebKitFormBoundaryABC123';
      const boundary = FormDataParser.extractBoundaryFromContentType(contentType);
      expect(boundary).toBe('----WebKitFormBoundaryABC123');
    });
    
    it('should extract quoted boundary', () => {
      const contentType = 'multipart/form-data; boundary="----WebKitFormBoundaryABC123"';
      const boundary = FormDataParser.extractBoundaryFromContentType(contentType);
      expect(boundary).toBe('----WebKitFormBoundaryABC123');
    });
    
    it('should return null for invalid Content-Type', () => {
      const contentType = 'application/json';
      const boundary = FormDataParser.extractBoundaryFromContentType(contentType);
      expect(boundary).toBeNull();
    });
    
    it('should return null for null Content-Type', () => {
      const boundary = FormDataParser.extractBoundaryFromContentType(null);
      expect(boundary).toBeNull();
    });
  });
  
  describe('isPDFPart', () => {
    it('should detect PDF by Content-Type', () => {
      const headers = 'Content-Disposition: form-data; name="file"; filename="document.pdf"\r\nContent-Type: application/pdf';
      const isPDF = FormDataParser.isPDFPart(headers);
      expect(isPDF).toBe(true);
    });
    
    it('should detect PDF by filename', () => {
      const headers = 'Content-Disposition: form-data; name="file"; filename="document.pdf"\r\nContent-Type: application/octet-stream';
      const isPDF = FormDataParser.isPDFPart(headers);
      expect(isPDF).toBe(true);
    });
    
    it('should return false for non-PDF content', () => {
      const headers = 'Content-Disposition: form-data; name="file"; filename="document.jpg"\r\nContent-Type: image/jpeg';
      const isPDF = FormDataParser.isPDFPart(headers);
      expect(isPDF).toBe(false);
    });
    
    it('should return false for null headers', () => {
      const isPDF = FormDataParser.isPDFPart(null);
      expect(isPDF).toBe(false);
    });
  });
  
  describe('extractFilename', () => {
    it('should extract filename from headers', () => {
      const headers = 'Content-Disposition: form-data; name="file"; filename="document.pdf"\r\nContent-Type: application/pdf';
      const filename = FormDataParser.extractFilename(headers);
      expect(filename).toBe('document.pdf');
    });
    
    it('should extract quoted filename', () => {
      const headers = 'Content-Disposition: form-data; name="file"; filename="my document.pdf"\r\nContent-Type: application/pdf';
      const filename = FormDataParser.extractFilename(headers);
      expect(filename).toBe('my document.pdf');
    });
    
    it('should return null for missing filename', () => {
      const headers = 'Content-Disposition: form-data; name="file"\r\nContent-Type: application/pdf';
      const filename = FormDataParser.extractFilename(headers);
      expect(filename).toBeNull();
    });
    
    it('should return null for null headers', () => {
      const filename = FormDataParser.extractFilename(null);
      expect(filename).toBeNull();
    });
  });
  
  describe('isBase64PDF', () => {
    it('should detect data URL PDF', () => {
      const data = 'data:application/pdf;base64,JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdL1Jlc291cmNlczw8L0ZvbnQ8PC9GMSAxMSAwIFI+Pj4+L0NvbnRlbnRzIDQgMCBSL1BhcmVudCAyIDAgUj4+CmVuZG9iago0IDAgb2JqCjw8L0xlbmd0aCAxMzM+PnN0cmVhbQowLjU2NyB3CjAgRwoxIGcKQlQKL0YxIDE2IFRmCjIwIDc3MiBUZAooSGVsbG8gV29ybGQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKMTEgMCBvYmoKPDwvVHlwZS9Gb250L1N1YnR5cGUvVHlwZTEvQmFzZUZvbnQvSGVsdmV0aWNhPj4KZW5kb2JqCjEyIDAgb2JqCjw8L1R5cGUvRW5jb2RpbmcvRGlmZmVyZW5jZXNbMCAvRy9UL2EvZS9sL28vci9XL2RdPj4KZW5kb2JqCnhyZWYKMCAxMwowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTExIDAwMDAwIG4gCjAwMDAwMDAyMjIgMDAwMDAgbiAKMDAwMDAwMDQwNyAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgMTMvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgo0NzQKJSVFT0YK';
      const isPDF = FormDataParser.isBase64PDF(data);
      expect(isPDF).toBe(true);
    });
    
    it('should detect raw base64 PDF with magic number', () => {
      // JVBERi0 is the base64 encoding of %PDF-
      const data = 'JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoK';
      const isPDF = FormDataParser.isBase64PDF(data);
      expect(isPDF).toBe(true);
    });
    
    it('should return false for non-PDF base64', () => {
      // This is not a PDF
      const data = 'SGVsbG8gV29ybGQ=';
      const isPDF = FormDataParser.isBase64PDF(data);
      expect(isPDF).toBe(false);
    });
    
    it('should return false for non-string input', () => {
      const isPDF = FormDataParser.isBase64PDF({});
      expect(isPDF).toBe(false);
    });
  });
  
  describe('processBase64PDF', () => {
    // Mock implementation of atob for testing
    const originalAtob = global.atob;
    beforeAll(() => {
      global.atob = jest.fn(str => Buffer.from(str, 'base64').toString('binary'));
    });
    
    afterAll(() => {
      global.atob = originalAtob;
    });
    
    it('should process data URL PDF', () => {
      // Mock Blob for testing
      global.Blob = jest.fn().mockImplementation(content => ({
        size: 100,
        type: 'application/pdf'
      }));
      
      const data = 'data:application/pdf;base64,JVBERi0xLjc=';
      const result = FormDataParser.processBase64PDF(data);
      
      expect(result).toBeDefined();
      expect(result.size).toBe(100);
      expect(result.blob).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
    
    it('should process raw base64 PDF', () => {
      // Mock Blob for testing
      global.Blob = jest.fn().mockImplementation(content => ({
        size: 200,
        type: 'application/pdf'
      }));
      
      const data = 'JVBERi0xLjc=';
      const result = FormDataParser.processBase64PDF(data);
      
      expect(result).toBeDefined();
      expect(result.size).toBe(200);
      expect(result.blob).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });
    
    it('should return null for oversized PDF', () => {
      // Mock Blob for testing with size larger than MAX_PDF_SIZE
      global.Blob = jest.fn().mockImplementation(content => ({
        size: FormDataParser.MAX_PDF_SIZE + 1,
        type: 'application/pdf'
      }));
      
      const data = 'JVBERi0xLjc=';
      const result = FormDataParser.processBase64PDF(data);
      
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalled();
    });
    
    it('should return null on error', () => {
      // Force an error by making atob throw
      global.atob = jest.fn().mockImplementation(() => {
        throw new Error('Invalid base64');
      });
      
      const data = 'invalid-base64';
      const result = FormDataParser.processBase64PDF(data);
      
      expect(result).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
}); 