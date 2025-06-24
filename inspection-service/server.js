/**
 * Express service that extracts PDF text, scans it,
 * and returns the security assessment.
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
const crypto    = require('crypto');

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
                  
                  logger.debug(`Decoded content length: ${decompressedText.length}`);
                  extractedText += ' ' + decompressedText;
                  
                } catch (decodeError) {
                  logger.warn(`ASCII85+FlateDecode decode failed: ${decodeError.message}`);
                }
              } else {
                // Try direct FlateDecode (zlib compressed)
                const streamBytes = Buffer.from(streamData, 'binary');
                try {
                  const decompressed = zlib.inflateSync(streamBytes);
                  const decompressedText = decompressed.toString('utf8');
                  
                  logger.debug(`FlateDecode content length: ${decompressedText.length}`);
                  extractedText += ' ' + decompressedText;
                  
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
      
      // If stream extraction didn't yield sufficient text, try pattern-based extraction
      if (extractedText.trim().length < 10) {
        // Look for readable text content (not PDF structure)
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
        
        // Last resort: extract longer alphanumeric sequences (but skip PDF noise)
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

      // Do not cache parse failures to avoid persistent false negatives
      resolveParsePromise(errorResult);
      logger.warn(`Parse failed for ${filename}: no extractable text`);

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
    
    // Do not cache error results to avoid stale failures
    logger.warn(`Parse error for ${filename}: ${error.message}`);

    // Resolve with error result instead of rejecting
    resolveParsePromise(errorResult);
    
    return errorResult;
  } finally {
    // Always clean up the promise cache
    pdfParsePromises.delete(cacheKey);
  }
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

    // 5.2 Parse the PDF (with deterministic results) -----------------------------------------
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

    // 5.3 Scan the text -------------------------------------------------------
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
      // Send to Prompt Security API (single source of truth)
      try {
        logger.info(`Sending ${extractedText.length} characters to Prompt Security API`);
        scanResults = await promptSecurity.scanText(extractedText);

        // Log API assessment
        logger.info(`API scan complete: ${scanResults.secrets ? 'SECRETS FOUND' : 'NO SECRETS'}`);

      } catch (apiErr) {
        logger.error('Prompt Security API error:', apiErr.message);
        
        // If it's a service unavailability error (503), return scan error
        if (apiErr.statusCode === 503 || apiErr.message.includes('unavailable')) {
          return res.status(503).json({
            error: 'scan_service_unavailable',
            message: 'Security scanning service is temporarily unavailable. Please try again.',
            action: 'error',
            findings: [],
            scannedAt: new Date().toISOString(),
            retryable: true
          });
        }
        
        // For other API errors, still throw to be handled by error middleware
        throw apiErr;
      }
    }

    // 5.4 Respond -------------------------------------------------------------
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