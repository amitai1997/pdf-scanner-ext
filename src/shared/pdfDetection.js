/**
 * Shared PDF detection utilities
 * Consolidates PDF detection logic to avoid duplication
 */

import { PDF_CONSTANTS } from './constants.js';

/**
 * Check if a file is a PDF candidate based on various heuristics
 * @param {File|Blob|Object} file - File object or file-like object
 * @returns {boolean} - Whether the file is likely a PDF
 */
export function isPdfCandidate(file) {
  if (!file) return false;
  
  // Check MIME type
  if (file.type && PDF_CONSTANTS.PDF_MIME_TYPES.includes(file.type)) {
    return true;
  }
  
  // Check file extension
  if (file.name && file.name.toLowerCase().endsWith('.pdf')) {
    return true;
  }
  
  // Check for filename patterns in objects
  if (typeof file === 'object' && !file.type && !file.name) {
    const filename = file.filename || file.originalname;
    if (filename && filename.toLowerCase().endsWith('.pdf')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a request body contains a PDF
 * @param {any} body - Request body (FormData, Blob, File, string, etc.)
 * @returns {boolean} - Whether the body likely contains a PDF
 */
export function checkIfBodyContainsPDF(body) {
  try {
    if (!body) return false;
    
    // If it's a string, check for PDF indicators
    if (typeof body === 'string') {
      return body.includes('application/pdf') || 
             body.includes('.pdf') || 
             body.includes('%PDF-') ||
             body.includes('data:application/pdf');
    }
    
    // If it's FormData, check its entries
    if (body instanceof FormData) {
      let hasPDF = false;
      body.forEach((value, key) => {
        if (isPdfCandidate(value)) {
          hasPDF = true;
        }
      });
      return hasPDF;
    }
    
    // If it's a Blob or File, check directly
    if (body instanceof Blob || body instanceof File) {
      return isPdfCandidate(body);
    }
    
    return false;
  } catch (e) {
    console.warn('[PDF Detection] Error checking if body contains PDF:', e);
    return false;
  }
}

/**
 * Check if a part's headers indicate it's a PDF file
 * @param {string} headers - Headers section of a multipart part
 * @returns {boolean} - True if this part contains a PDF
 */
export function isPDFPart(headers) {
  if (!headers) {
    return false;
  }
  
  // Check for PDF content type
  const isPDFContentType = PDF_CONSTANTS.PDF_MIME_TYPES.some(type => 
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
 * Check if a string is base64 encoded PDF data
 * @param {string} data - String to check
 * @returns {boolean} - Whether the string appears to be base64 PDF data
 */
export function isBase64PDF(data) {
  if (!data || typeof data !== 'string' || data.length < 10) {
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
 * Check if file size exceeds the maximum allowed
 * @param {number} size - File size in bytes
 * @returns {boolean} - Whether the file is too large
 */
export function isFileTooLarge(size) {
  return size > PDF_CONSTANTS.MAX_PDF_SIZE;
}

/**
 * Extract filename from multipart part headers
 * @param {string} headers - Headers section of a multipart part
 * @returns {string|null} - Filename or null if not found
 */
export function extractFilename(headers) {
  if (!headers) {
    return null;
  }
  
  // Look for filename in Content-Disposition header
  const filenameMatch = headers.match(/filename=["']?([^"';\r\n]*)["']?/i);
  if (filenameMatch && filenameMatch[1]) {
    return filenameMatch[1].trim();
  }
  
  return null;
}

// For CommonJS compatibility (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isPdfCandidate,
    checkIfBodyContainsPDF,
    isPDFPart,
    isBase64PDF,
    isFileTooLarge,
    extractFilename,
  };
} 