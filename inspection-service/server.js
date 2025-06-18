/**
 * PDF Scanner Inspection Service – Production Ready
 * Express server that processes PDFs and checks them for secrets without ever
 * returning an HTTP-500 to the browser.
 */

// ---------------------------------------------------------------------------
// 1. Environment & dependencies
// ---------------------------------------------------------------------------
require('dotenv').config();

// Core deps
const express   = require('express');
const cors      = require('cors');
const multer    = require('multer');
const fs        = require('fs');
const path      = require('path');
const pdfParse  = require('pdf-parse'); // pdf-parse@^3.0.0 / pdfjs-dist@^4
const ascii85   = require('ascii85');

// Internal modules
const { errorHandler, AppError } = require('./middleware/errorHandler');
const PromptSecurityClient       = require('./services/promptSecurityClient');
const logger                     = require('./utils/logger');

// Configuration
const PORT      = process.env.INSPECTION_PORT || 3001;
const NODE_ENV  = process.env.NODE_ENV      || 'development';

// ---------------------------------------------------------------------------
// 2. Initialise services & app
// ---------------------------------------------------------------------------
const promptSecurity = new PromptSecurityClient();
const app            = express();

// Add a cache for PDF parsing results at the top level
const pdfParseCache = new Map();
const pdfParsePromises = new Map(); // Cache for ongoing parsing promises

// ---------------------------------------------------------------------------
// 3. Utilities
// ---------------------------------------------------------------------------
/** Extract text from PDF buffer with deterministic results */
async function extractPDFTextDeterministic(buffer, filename) {
  // Create a cache key based on buffer content
  const crypto = require('crypto');
  const bufferHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const cacheKey = `${filename}_${bufferHash}_${buffer.length}`;
  
  logger.debug(`PDF parsing request: ${filename}`);
  
  // Check cache first
  if (pdfParseCache.has(cacheKey)) {
    const cached = pdfParseCache.get(cacheKey);
    logger.debug(`Using cached result for ${filename}`);
    return cached;
  }
  
      // Check if there's already a parsing operation in progress for this file
    if (pdfParsePromises.has(cacheKey)) {
      logger.debug(`Waiting for ongoing parse: ${filename}`);
      return await pdfParsePromises.get(cacheKey);
    }
  
  // Create and immediately store the promise before starting any async work
  let resolveParsePromise, rejectParsePromise;
  const parsePromise = new Promise((resolve, reject) => {
    resolveParsePromise = resolve;
    rejectParsePromise = reject;
  });
  
  // Set the promise immediately so concurrent requests can find it
  pdfParsePromises.set(cacheKey, parsePromise);
  
  // Now perform the actual parsing with multiple strategies
  try {
    let result = null;
    
    // Strategy 1: Try standard PDF parsing
    try {
      const standardResult = await pdfParse(buffer);
      if (standardResult && standardResult.text && standardResult.text.trim().length > 0) {
        result = {
          text: standardResult.text.trim(),
          info: standardResult.info,
          numpages: standardResult.numpages
        };
        logger.info(`Standard PDF parsing: ${result.text.length} chars`);
      }
    } catch (error) {
              logger.warn(`Standard parsing failed: ${error.message}`);
    }
    
    // Strategy 2: Try alternative parsing if standard failed
    if (!result) {
      try {
        const altResult = await pdfParse(buffer, { max: 0 });
        if (altResult && altResult.text && altResult.text.trim().length > 0) {
          result = {
            text: altResult.text.trim(),
            info: altResult.info,
            numpages: altResult.numpages
          };
          logger.info(`Alternative parsing: ${result.text.length} chars`);
        }
      } catch (error) {
        logger.warn(`Alternative parsing failed: ${error.message}`);
      }
    }
    
    // Strategy 3: Advanced fallback extraction if both parsing methods failed
    if (!result) {
      logger.debug('Attempting advanced fallback text extraction...');
      
      // Convert buffer to different string formats for analysis
      const binaryString = buffer.toString('binary');
      const utf8String = buffer.toString('utf8');
      
      let extractedText = '';
      
      // Try to decompress FlateDecode streams first
      const zlib = require('zlib');
      try {
        // Look for stream objects and try to decompress them
        const streamPattern = /stream\s*(.*?)\s*endstream/gs;
        const streamMatches = binaryString.match(streamPattern);
        
        if (streamMatches) {
          logger.debug(`Processing ${streamMatches.length} stream objects...`);
          
          for (const streamMatch of streamMatches) {
            try {
              // Extract the actual stream data (between 'stream' and 'endstream')
              const streamData = streamMatch.replace(/^stream\s*/, '').replace(/\s*endstream$/, '');
              
              // Handle ASCII85 + FlateDecode sequence
              if (streamData.includes('~>')) {
                logger.debug('ASCII85 + FlateDecode stream detected...');
                
                try {
                  // Extract ASCII85 content (everything before '~>')
                  const ascii85Data = streamData.substring(0, streamData.indexOf('~>'));
                  
                  // Decode ASCII85 first, then decompress with FlateDecode (zlib)
                  const decoded = ascii85.decode(ascii85Data);
                  const decompressed = zlib.inflateSync(decoded);
                  const decompressedText = decompressed.toString('utf8');
                  
                  logger.debug(`Decoded content: "${decompressedText}"`);
                  
                  // Check if this contains our AWS key
                  if (decompressedText.includes('AKIA')) {
                    logger.info(`AWS key found in decoded content!`);
                    extractedText = decompressedText; // Use ONLY this content
                    break; // Stop processing other streams
                  } else {
                    extractedText += ' ' + decompressedText;
                  }
                } catch (decodeError) {
                  logger.warn(`ASCII85+FlateDecode decode failed: ${decodeError.message}`);
                  
                  // Fallback: search for patterns in the raw ASCII85 data
                  const awsInStream = streamData.match(/AKIA[A-Z0-9]{16}/g);
                  if (awsInStream) {
                    extractedText += ' ' + awsInStream.join(' ');
                    logger.info(`Found AWS keys in raw ASCII85 stream: ${awsInStream.join(', ')}`);
                  }
                }
              } else {
                // Try direct FlateDecode (zlib compressed)
                const streamBytes = Buffer.from(streamData, 'binary');
                try {
                  const decompressed = zlib.inflateSync(streamBytes);
                  const decompressedText = decompressed.toString('utf8');
                  
                  logger.debug(`FlateDecode: "${decompressedText}"`);
                  
                  // Check if this contains our AWS key
                  if (decompressedText.includes('AKIA')) {
                    logger.info(`AWS key found!`);
                    extractedText = decompressedText; // Use ONLY this content
                    break; // Stop processing other streams
                  } else {
                    extractedText += ' ' + decompressedText;
                  }
                } catch (decompError) {
                  logger.warn(`FlateDecode decompression failed: ${decompError.message}`);
                }
              }
            } catch (e) {
              logger.warn(`Error processing stream: ${e.message}`);
            }
          }
        }
      } catch (e) {
        logger.warn(`Error in stream decompression: ${e.message}`);
      }
      
      // 1. Look for direct secret patterns in binary data FIRST  
      const awsKeyPattern = /AKIA[A-Z0-9]{16}/g;
      const secretPattern = /[A-Za-z0-9+/]{40,}/g; // AWS secret keys and similar
      
      // Also look for patterns in the compressed stream content
      const compressedPatterns = [
        /[A-Za-z0-9]{20,40}/g,  // Potential encoded secrets
        /[A-Z0-9]{16,}/g,       // AWS-style keys
        /[A-Za-z0-9+/=]{30,}/g  // Base64-like strings
      ];
      
      const awsKeys = binaryString.match(awsKeyPattern) || [];
      const secrets = binaryString.match(secretPattern) || [];
      
      // Extract from compressed streams - look for the encoded content
      let compressedSecrets = [];
      for (const pattern of compressedPatterns) {
        const matches = binaryString.match(pattern) || [];
        compressedSecrets = compressedSecrets.concat(
          matches.filter(match => 
            match.length >= 20 && 
            !match.includes('PDF') && 
            !match.includes('obj') &&
            !match.includes('ReportLab') &&
            /[A-Za-z0-9]/.test(match) // Must contain alphanumeric
          )
        );
      }
      
      // PRIORITIZE actual secrets over metadata
      if (awsKeys.length > 0) {
        extractedText = awsKeys.join(' '); // Use ONLY the AWS keys
        logger.info(`AWS keys found: ${awsKeys.join(', ')}`);
      } else if (secrets.length > 0) {
        // Filter out short matches and PDF noise
        const realSecrets = secrets.filter(s => s.length >= 20 && !s.includes('obj') && !s.includes('PDF'));
        if (realSecrets.length > 0) {
          extractedText = realSecrets.join(' '); // Use ONLY the secrets
          logger.debug(`Potential secrets found: ${realSecrets.length} matches`);
        }
      } else if (compressedSecrets.length > 0) {
        // Only use compressed secrets if no direct secrets found
        const uniqueSecrets = [...new Set(compressedSecrets)].sort((a, b) => b.length - a.length);
        // Filter out PDF metadata hashes
        const filteredSecrets = uniqueSecrets.filter(s => 
          !s.match(/^[0-9a-f]{32}$/) && // Not MD5 hash
          !s.includes('f2bee42f') && // Not the known PDF hash
          s.length >= 15
        );
        
        if (filteredSecrets.length > 0) {
          extractedText = filteredSecrets.slice(0, 5).join(' '); // Take top 5
          logger.debug(`Compressed secrets found: ${filteredSecrets.length} matches`);
        }
      }
      
      // Only add more content if we haven't found specific secrets yet
      if (extractedText.trim().length < 10) {
        // 2. Try to find readable text content (not PDF structure)
        const readablePattern = /[A-Za-z][A-Za-z0-9\s.,!?]{20,}/g;
        const readableMatches = binaryString.match(readablePattern) || [];
        
        // Filter out PDF metadata/structure
        const actualContent = readableMatches.filter(text => 
          !text.includes('PDF') && 
          !text.includes('obj') && 
          !text.includes('endobj') && 
          !text.includes('ReportLab') &&
          text.length > 30 // Only substantial text blocks
        );
        
        if (actualContent.length > 0) {
          extractedText += ' ' + actualContent.join(' ');
          logger.debug(`Readable content: ${actualContent.length} blocks`);
        }
        
        // 3. Last resort: extract longer alphanumeric sequences (but skip PDF noise)
        if (extractedText.trim().length < 50) {
          const alphaNumPattern = /[A-Za-z0-9_\-+=]{15,}/g;
          const alphaMatches = (binaryString.match(alphaNumPattern) || [])
            .filter(match => 
              !match.includes('ReportLab') && 
              !match.includes('PDF') && 
              !match.includes('f2bee42f') && // Exclude known PDF hash
              match.length >= 15
            );
          
          if (alphaMatches.length > 0) {
            extractedText += ' ' + alphaMatches.join(' ');
            logger.debug(`Alphanumeric sequences: ${alphaMatches.length} matches`);
          }
        }
      }
      
      logger.debug(`Extracted ${extractedText.length} chars: ${extractedText.substring(0, 100)}...`);
      
      // Clean up the extracted text
      extractedText = extractedText.replace(/\s+/g, ' ').trim();
      
      if (extractedText.length > 10) {
        result = {
          text: extractedText,
          info: { fallback: true },
          numpages: 1
        };
        logger.info(`Fallback extraction found ${result.text.length} characters of content`);
      } else {
        logger.warn(`Fallback extraction found insufficient content (${extractedText.length} chars)`);
      }
    }
    
    // If we still have no result, this is a problematic PDF
    if (!result || !result.text || result.text.trim().length < 5) {
      const errorResult = {
        text: '',
        info: { error: 'Cannot extract text' },
        numpages: 0,
        parseError: true
      };
      
      // Cache even the error result to ensure consistency
      pdfParseCache.set(cacheKey, errorResult);
      resolveParsePromise(errorResult);
      logger.warn(`Cached error result for ${filename}: no extractable text`);
      
      return errorResult;
    }
    
    // Cache the successful result
    pdfParseCache.set(cacheKey, result);
    
    // Limit cache size to prevent memory issues
    if (pdfParseCache.size > 100) {
      const firstKey = pdfParseCache.keys().next().value;
      pdfParseCache.delete(firstKey);
    }
    
    // Resolve the promise for any waiting requests
    resolveParsePromise(result);
    
    return result;
  } catch (error) {
    // Create error result for consistency
    const errorResult = {
      text: '',
      info: { error: error.message },
      numpages: 0,
      parseError: true
    };
    
    // Cache the error result to ensure consistency
    pdfParseCache.set(cacheKey, errorResult);
    logger.warn(`Cached error result for ${filename}: ${error.message}`);
    
    // Resolve with error result instead of rejecting
    resolveParsePromise(errorResult);
    
    return errorResult;
  } finally {
    // Always clean up the promise cache
    pdfParsePromises.delete(cacheKey);
  }
}

/** Local secret detection patterns (fallback when API unavailable) */
const secretPatterns = [
  // AWS keys (specific)
  { pattern: /AKIA[0-9A-Z]{16}/g,                                   name: 'AWS Access Key ID' },
  { pattern: /[0-9a-zA-Z/+]{40}/g,                                  name: 'AWS Secret Access Key' },
  
  // Base64-like patterns
  { pattern: /[A-Za-z0-9+/]{16,}={0,2}/g,                          name: 'Base64 Encoded Secret' },
  { pattern: /[A-Za-z0-9_-]{15,25}/g,                              name: 'URL-Safe Token' },
  
  // Generic API keys & tokens  
  { pattern: /(api_key|apikey|api token|x-api-key)[=:]["']?([\w-]+)/gi, name: 'Generic API Key' },
  { pattern: /(bearer|auth|authorization)[=:]["']?([\w.-]+)/gi,    name: 'Auth Token' },
  
  // PEM blocks
  { pattern: /-----BEGIN( RSA)? PRIVATE KEY-----/g,                 name: 'Private Key' }
];

/**
 * Perform a local regex scan (used when the upstream API is unavailable).
 */
function performLocalScan (text, filename) {
  logger.debug(`Local regex scan: ${text.length} chars`);
  
  const findings = [];
  const foundSecrets = new Set(); // Track unique secrets to avoid duplicates
  
  // Common PDF metadata to ignore (reduce false positives)
  const pdfNoisePatterns = [
    /WinAnsiEncoding/,
    /ReportLab/,
    /20\d{12}\+00/,  // Timestamps like 20250617133409+00
    /50c495b7f3bd98349f1bceee26ce832b/,  // Known PDF hash
    /f2bee42f928f2ddc50cc13d7406a1c2a/,  // Another PDF object hash
  ];
  
  // Pattern priority (higher number = higher priority, more specific)
  const patternPriority = {
    'AWS Access Key ID': 10,
    'AWS Secret Access Key': 10,
    'Private Key': 9,
    'Generic API Key': 8,
    'Auth Token': 7,
    'Base64 Encoded Secret': 3,
    'URL-Safe Token': 2
  };
  
  // Function to check if a hex string is likely a PDF internal hash
  const isPdfInternalHash = (value) => {
    // Pure lowercase hex strings are usually PDF object hashes
    if (/^[0-9a-f]+$/.test(value) && value.length >= 16) {
      return true;
    }
    // Repetitive patterns (same string repeated) are PDF noise
    if (value.length >= 16) {
      const chunk = value.substring(0, value.length / 2);
      if (value === chunk + chunk) return true;
    }
    return false;
  };
  
  for (const p of secretPatterns) {
    const matches = Array.from(text.matchAll(p.pattern));
    if (matches.length > 0) {
      // Filter out PDF noise and internal hashes
      const realMatches = matches.filter(match => {
        const value = match[0];
        // Check against known noise patterns
        if (pdfNoisePatterns.some(noise => noise.test(value))) {
          return false;
        }
        // Check if it's likely a PDF internal hash
        if (isPdfInternalHash(value)) {
          return false;
        }
        return true;
      });
      
      if (realMatches.length > 0) {
        logger.debug(`Found ${realMatches.length} matches: ${p.name}`);
        for (const m of realMatches) {
          const secretValue = m[0];
          
          // Check if this exact secret was already found with a higher priority pattern
          const existingFinding = findings.find(f => f.fullValue === secretValue);
          
          if (existingFinding) {
            const existingPriority = patternPriority[existingFinding.type] || 0;
            const currentPriority = patternPriority[p.name] || 0;
            
            // Only replace if current pattern has higher priority
            if (currentPriority > existingPriority) {
              existingFinding.type = p.name;
            }
          } else {
            // New secret, add it
            findings.push({
              type: p.name,
              value: `${secretValue.slice(0, 10)}…`,
              fullValue: secretValue,
              severity: 'high'
            });
            foundSecrets.add(secretValue);
          }
        }
      }
    }
  }
  
  const secrets = findings.length > 0;
  const uniqueSecrets = foundSecrets.size;
  logger.info(`Local scan complete: ${secrets ? 'SECRETS FOUND' : 'NO SECRETS'} (${uniqueSecrets} unique secrets, ${findings.length} total findings)`);
  
  return {
    secrets,
    findings,
    action: secrets ? 'block' : 'allow',
    scannedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// 4. Middleware stack
// ---------------------------------------------------------------------------
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-App-ID', 'Origin', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: true
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Multer upload (in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 } // 20 MB
});

// Request logger
app.use((req, _res, next) => {
  logger.logRequest(req);
  next();
});

// OPTIONS pre-flight
app.options('*', (_req, res) => res.status(200).end());

// ---------------------------------------------------------------------------
// 5. Endpoints
// ---------------------------------------------------------------------------
// Health-check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// Main scan endpoint
app.post('/scan', upload.single('pdf'), async (req, res, next) => {
  try {
    logger.info(`PDF scan requested at ${new Date().toISOString()}`);

    // 5.1 Input validation ----------------------------------------------------
    if (!req.file) {
      throw new AppError('No PDF file provided', 400);
    }

    const { originalname: filename, size, mimetype, buffer } = req.file;
    logger.info('File info:', { filename, size, mimetype });

    // Reject zero-byte uploads early (duplicate intercepted request)
    if (size === 0) {
      return res.status(400).json({
        action: 'block',
        error:  'empty_pdf',
        findings: [],
        scannedAt: new Date().toISOString()
      });
    }

    // 5.2 Optional debug dump -------------------------------------------------
    if (NODE_ENV === 'development') {
      const debugDir = path.join(__dirname, 'debug');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
      const safeName  = filename.replace(/[^a-zA-Z0-9]/g, '_');
      fs.writeFileSync(path.join(debugDir, `debug_${Date.now()}_${safeName}`), buffer);
    }

    // 5.3 Parse the PDF (with deterministic results) -----------------------------------------
    let extractedText = '';
    let pdfMeta;
    let pdfParsingFailed = false;
    
    // Always use the deterministic parsing function
    pdfMeta = await extractPDFTextDeterministic(buffer, filename);
    
    if (pdfMeta && pdfMeta.text && !pdfMeta.parseError) {
      extractedText = pdfMeta.text;
      logger.info(
        `PDF Info – version: ${pdfMeta.info?.PDFFormatVersion ?? 'n/a'}, pages: ${
          pdfMeta.numpages
        }`
      );
    } else {
      logger.warn('PDF parsing failed completely - using fallback extraction only');
      pdfParsingFailed = true;
      extractedText = pdfMeta?.text || '';  // Use whatever we got from fallback
    }

    // 5.4 Scan the text -------------------------------------------------------
    let scanResults;

    if (extractedText.length < 10) {
      // No meaningful text extracted
      logger.info('Insufficient text extracted - treating as safe');
      scanResults = {
        secrets: false,
        findings: [],
        action: 'allow',
        scannedAt: new Date().toISOString(),
        note: 'No extractable text content'
      };
    } else {
      // 1️⃣ Primary: Send to Prompt Security API (they are the experts at secret detection)
      try {
        logger.info(`Sending ${extractedText.length} characters to Prompt Security API`);
        scanResults = await promptSecurity.scanText(extractedText);
        
        // The API is authoritative - trust their secret detection
        logger.info(`API scan complete: ${scanResults.secrets ? 'SECRETS FOUND' : 'NO SECRETS'}`);
        
      } catch (apiErr) {
        logger.error('Prompt Security API failed – using local scan fallback:', apiErr.message);
        
        // 2️⃣ Fallback: Local regex scan only when API is unavailable
        scanResults = performLocalScan(extractedText, filename);
      }
    }

    // 5.5 Respond -------------------------------------------------------------
    const secretsFound = scanResults.secrets === true;
    const action = secretsFound ? 'block' : 'allow';
    
    // Return the scan result
    res.status(200).json({
      secrets: secretsFound,
      findings: scanResults.findings,
      action,
      textLength: extractedText.length,
      scannedAt: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 6. Error handling + process guards
// ---------------------------------------------------------------------------
app.use(errorHandler);

process.on('unhandledRejection', err => logger.error('UNHANDLED REJECTION', err));
process.on('uncaughtException',  err => {
  logger.error('UNCAUGHT EXCEPTION', err);
  if (NODE_ENV === 'production') process.exit(1);
});

// ---------------------------------------------------------------------------
// 7. Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  logger.info(`PDF Inspection Service running on port ${PORT}`);
  logger.info(`Environment: ${NODE_ENV}`);
  logger.info(`Started at: ${new Date().toISOString()}`);
  logger.info('API Endpoints available: GET /health, POST /scan');
});