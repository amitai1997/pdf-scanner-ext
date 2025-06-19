/**
 * Shared hash utilities
 * Consolidates hashing logic for both browser and Node.js environments
 */

/**
 * Compute SHA-256 hash of base64 string in browser environment
 * @param {string} base64String - Base64 encoded string
 * @returns {Promise<string>} - SHA-256 hash as hex string
 */
export async function computeHashBrowser(base64String) {
  if (typeof base64String !== 'string' || !base64String) {
    console.warn('[Hash Utils] Cannot compute hash for invalid input.');
    // Return SHA-256 of empty string for invalid input
    return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }
  
  // Remove data URL prefix if present
  let base64 = base64String.split(',')[1] || base64String;

  // Robust base-64 normalisation & decoding
  let normalised = base64
    .replace(/^data:[^,]*,/, '')      // strip any data-URL header
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .trim();

  try {
    // Decode %xx escapes if present
    normalised = decodeURIComponent(normalised);
  } catch (_) { 
    // not URI-encoded – ignore
  }

  // Keep only legal base-64 chars
  normalised = normalised.replace(/[^A-Za-z0-9+/=]/g, '');

  // Pad to multiple of 4
  while (normalised.length % 4) {
    normalised += '=';
  }

  let binaryString;
  try {
    binaryString = atob(normalised);
  } catch (e) {
    console.warn('[Hash Utils] atob failed; hashing raw text instead', e);
    // Hash the cleaned text itself (deterministic fallback)
    const fallbackBytes = new TextEncoder().encode(normalised);
    const hashBuffer = await crypto.subtle.digest('SHA-256', fallbackBytes);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute SHA-256 hash of buffer in Node.js environment
 * @param {Buffer} buffer - Buffer to hash
 * @returns {string} - SHA-256 hash as hex string
 */
export function computeHashNode(buffer) {
  if (typeof require === 'undefined') {
    throw new Error('Node.js crypto module not available');
  }
  
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute SHA-256 hash of string in Node.js environment
 * @param {string} str - String to hash
 * @returns {string} - SHA-256 hash as hex string
 */
export function computeHashNodeString(str) {
  if (typeof require === 'undefined') {
    throw new Error('Node.js crypto module not available');
  }
  
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/**
 * Universal hash function that works in both browser and Node.js
 * @param {string|Buffer} input - Input to hash
 * @returns {Promise<string>} - SHA-256 hash as hex string
 */
export async function computeHash(input) {
  // Detect environment
  const isNode = typeof require !== 'undefined' && typeof window === 'undefined';
  
  if (isNode) {
    // Node.js environment
    if (Buffer.isBuffer(input)) {
      return computeHashNode(input);
    } else if (typeof input === 'string') {
      return computeHashNodeString(input);
    } else {
      throw new Error('Invalid input type for Node.js hash');
    }
  } else {
    // Browser environment
    if (typeof input === 'string') {
      return await computeHashBrowser(input);
    } else {
      throw new Error('Browser environment only supports string input');
    }
  }
}

// For CommonJS compatibility (Node.js)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeHashBrowser,
    computeHashNode,
    computeHashNodeString,
    computeHash,
  };
} 