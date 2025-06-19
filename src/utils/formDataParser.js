/** Extracts PDFs from multipart or JSON request bodies (20 MB limit enforced). */

/**
 * FormData Parser utility class
 * Handles extracting PDF data from various request formats
 */
class FormDataParser {
  /**
   * Supported PDF MIME types for detection
   */
  static PDF_MIME_TYPES = [
    'application/pdf',
    'application/x-pdf',
    'application/acrobat',
    'application/vnd.pdf',
  ];
  
  /**
   * Maximum PDF size to process (20MB)
   */
  static MAX_PDF_SIZE = 20 * 1024 * 1024;
  
  /**
   * Extract PDF data from multipart/form-data request with boundary
   * @param {ArrayBuffer} buffer - Raw request body
   * @param {string} boundary - Form boundary string
   * @returns {Object|null} - PDF data object or null if not found
   */
  static extractPDFFromMultipart(buffer, boundary) {
    try {
      if (!buffer || !boundary) {
        return null;
      }
      
      // Convert buffer to string
      const decoder = new TextDecoder('utf-8');
      const body = decoder.decode(buffer);
      
      // Split by boundary
      const parts = body.split(`--${boundary}`);
      
      // Process each part
      for (const part of parts) {
        // Skip empty parts
        if (!part || part.trim() === '--') {
          continue;
        }
        
        // Find header/body separator
        const headerEndIndex = part.indexOf('\r\n\r\n');
        if (headerEndIndex === -1) {
          continue;
        }
        
        const headers = part.substring(0, headerEndIndex);
        const content = part.substring(headerEndIndex + 4);
        
        // Check if this is a PDF part
        const isPDF = this.isPDFPart(headers);
        if (!isPDF) {
          continue;
        }
        
        // Extract filename
        const filename = this.extractFilename(headers) || 'document.pdf';
        
        // Create Blob and check size
        const contentBytes = this.stringToArrayBuffer(content);
        const blob = new Blob([contentBytes], { type: 'application/pdf' });
        
        if (blob.size > this.MAX_PDF_SIZE) {
          self.logger.warn(`PDF too large: ${blob.size} bytes`);
          return null;
        }
        
        return {
          filename,
          size: blob.size,
          blob,
          timestamp: new Date().toISOString()
        };
      }
      
      return null;
    } catch (error) {
      self.logger.error('Error extracting PDF from multipart data:', error);
      return null;
    }
  }
  
  /**
   * Extract PDF data from JSON object (for base64 encoded PDFs)
   * @param {Object} jsonData - Parsed JSON object
   * @returns {Object|null} - PDF data object or null if not found
   */
  static extractPDFFromJSON(jsonData) {
    try {
      if (!jsonData || typeof jsonData !== 'object') {
        return null;
      }
      
      // Recursively search through the object
      const findPDFInObject = (obj, path = '') => {
        if (!obj || typeof obj !== 'object') {
          return null;
        }
        
        // Check each property
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          // Check if it's a base64 encoded PDF
          if (typeof value === 'string' && this.isBase64PDF(value)) {
            const pdfData = this.processBase64PDF(value);
            
            if (pdfData) {
              // Use key name to help determine filename if possible
              let filename = 'document.pdf';
              
              // Look for nearby filename field
              if (obj.filename || obj.name) {
                filename = obj.filename || obj.name;
                if (!filename.toLowerCase().endsWith('.pdf')) {
                  filename += '.pdf';
                }
              } else {
                // Use field name as a hint
                if (key.toLowerCase().includes('file') || 
                    key.toLowerCase().includes('pdf') || 
                    key.toLowerCase().includes('document')) {
                  filename = `${key}.pdf`;
                }
              }
              
              return {
                ...pdfData,
                filename,
                path: currentPath
              };
            }
          } 
          // Check if it might be a file object
          else if (typeof value === 'object' && 
                   value !== null && 
                   !Array.isArray(value) &&
                   (key.toLowerCase().includes('file') || 
                    key.toLowerCase().includes('attachment') || 
                    key.toLowerCase().includes('document'))) {
            // Check for common file object patterns
            if ((value.type && this.PDF_MIME_TYPES.includes(value.type)) ||
                (value.mimeType && this.PDF_MIME_TYPES.includes(value.mimeType))) {
              
              // Check for content/data field
              if (value.content || value.data) {
                const contentField = value.content || value.data;
                if (typeof contentField === 'string' && this.isBase64PDF(contentField)) {
                  const pdfData = this.processBase64PDF(contentField);
                  
                  if (pdfData) {
                    return {
                      ...pdfData,
                      filename: value.name || value.filename || 'document.pdf',
                      path: currentPath
                    };
                  }
                }
              }
            }
          }
          // Recursively check nested objects
          else if (typeof value === 'object' && value !== null) {
            const nestedResult = findPDFInObject(value, currentPath);
            if (nestedResult) {
              return nestedResult;
            }
          }
        }
        
        return null;
      };
      
      return findPDFInObject(jsonData);
    } catch (error) {
      self.logger.error('Error extracting PDF from JSON:', error);
      return null;
    }
  }
  
  /**
   * Check if a part's headers indicate it's a PDF file
   * @param {string} headers - Headers section of a multipart part
   * @returns {boolean} - True if this part contains a PDF
   */
  static isPDFPart(headers) {
    if (!headers) {
      return false;
    }
    
    // Check for PDF content type
    const isPDFContentType = this.PDF_MIME_TYPES.some(type => 
      headers.toLowerCase().includes(`content-type: ${type}`)
    );
    
    if (isPDFContentType) {
      return true;
    }
    
    // Check for filename with .pdf extension
    const filenameMatch = headers.match(/filename=["']?([^"']*\.pdf)["']?/i);
    return !!filenameMatch;
  }
  
  /**
   * Extract filename from part headers
   * @param {string} headers - Headers section of a multipart part
   * @returns {string|null} - Filename or null if not found
   */
  static extractFilename(headers) {
    if (!headers) {
      return null;
    }
    
    const filenameMatch = headers.match(/filename=["']?([^"';\r\n]*)["']?/i);
    return filenameMatch ? filenameMatch[1] : null;
  }
  
  /**
   * Check if a string is likely a base64 encoded PDF
   * @param {string} data - String data to check
   * @returns {boolean} - True if likely a base64 PDF
   */
  static isBase64PDF(data) {
    if (typeof data !== 'string') {
      return false;
    }
    
    // Check for data URL format
    if (data.startsWith('data:application/pdf;base64,')) {
      return true;
    }
    
    // Check for plain base64 with PDF magic number
    if (data.length > 100) {
      try {
        // PDF magic number is "%PDF-" which in base64 often starts with "JVB"
        // This is a heuristic and may produce false positives
        if (data.startsWith('JVB')) {
          const sample = atob(data.substring(0, 8));
          return sample.startsWith('%PDF-');
        }
      } catch (e) {
        // Not valid base64
        return false;
      }
    }
    
    return false;
  }
  
  /**
   * Process base64 encoded PDF data
   * @param {string} data - Base64 encoded PDF data
   * @returns {Object|null} - Object with blob and size, or null
   */
  static processBase64PDF(data) {
    try {
      // Extract base64 data from data URL if needed
      let base64Data = data;
      if (data.startsWith('data:application/pdf;base64,')) {
        base64Data = data.replace(/^data:application\/pdf;base64,/, '');
      }
      
      // Decode and create blob
      const binary = atob(base64Data);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      
      const blob = new Blob([array], {type: 'application/pdf'});
      
      // Check size
      if (blob.size > this.MAX_PDF_SIZE) {
        self.logger.warn(`Base64 PDF too large: ${blob.size} bytes`);
        return null;
      }
      
      return {
        blob,
        size: blob.size,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      self.logger.error('Error processing base64 PDF data:', error);
      return null;
    }
  }
  
  /**
   * Convert a string to ArrayBuffer
   * @param {string} str - String to convert
   * @returns {ArrayBuffer} - ArrayBuffer with string data
   */
  static stringToArrayBuffer(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }
  
  /**
   * Extract boundary string from Content-Type header
   * @param {string} contentType - Content-Type header value
   * @returns {string|null} - Boundary string or null if not found
   */
  static extractBoundaryFromContentType(contentType) {
    if (!contentType) {
      return null;
    }
    
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    return boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null;
  }
}

// Create a simple logger if not already available
if (!self.logger) {
  self.logger = {
    log(message, data) {
      try {
        if (data !== undefined) {
          console.log(`[PDF Scanner] ${message}`, data);
        } else {
          console.log(`[PDF Scanner] ${message}`);
        }
      } catch (e) {
        // Silent fail if console is not available
      }
    },
    
    warn(message, data) {
      try {
        if (data !== undefined) {
          console.warn(`[PDF Scanner] WARNING: ${message}`, data);
        } else {
          console.warn(`[PDF Scanner] WARNING: ${message}`);
        }
      } catch (e) {
        // Silent fail if console is not available
      }
    },
    
    error(message, data) {
      try {
        if (data !== undefined) {
          console.error(`[PDF Scanner] ERROR: ${message}`, data);
        } else {
          console.error(`[PDF Scanner] ERROR: ${message}`);
        }
      } catch (e) {
        // Silent fail if console is not available
      }
    }
  };
}

// Make FormDataParser available globally only if not already defined
if (typeof self !== 'undefined' && !self.FormDataParser) {
  self.FormDataParser = FormDataParser;
}

// For non-service worker contexts
if (typeof window !== 'undefined' && !window.FormDataParser) {
  window.FormDataParser = FormDataParser;
} 