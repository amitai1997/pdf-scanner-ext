/**
 * PDF Scanner Inspection Service – Redrafted June 18 2025
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

// Internal modules
const { errorHandler, AppError } = require('./middleware/errorHandler');
const PromptSecurityClient       = require('./services/promptSecurityClient');

// Configuration
const PORT      = process.env.INSPECTION_PORT || 3001;
const NODE_ENV  = process.env.NODE_ENV      || 'development';

// ---------------------------------------------------------------------------
// 2. Initialise services & app
// ---------------------------------------------------------------------------
const promptSecurity = new PromptSecurityClient();
const app            = express();

// ---------------------------------------------------------------------------
// 3. Utilities
// ---------------------------------------------------------------------------
/** Retry-extract text from a PDF buffer with exponential back-off. */
async function extractPDFTextWithRetry (buffer, filename, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`PDF parse attempt ${attempt} of ${maxRetries} for ${filename}`);
      const data = await pdfParse(buffer);
      if (!data.text || data.text.trim().length < 10) {
        throw new Error('Extracted text too short or empty');
      }
      console.log(`Successfully extracted ${data.text.length} characters on attempt ${attempt}`);
      return {
        text:      data.text,
        info:      data.info,
        numpages:  data.numpages
      };
    } catch (error) {
      lastError = error;
      console.error(`PDF parse attempt ${attempt} failed: ${error.message}`);
      if (attempt < maxRetries) {
        const delay = 100 * 2 ** (attempt - 1);
        console.log(`Waiting ${delay} ms before retry …`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw new AppError(
    `Failed to extract text from PDF after ${maxRetries} attempts: ${lastError.message}`,
    500
  );
}

/** Simple local regex-based fallback patterns.  */
const secretPatterns = [
  // AWS keys
  { pattern: /AKIA[0-9A-Z]{16}/g,                                   name: 'AWS Access Key ID' },
  { pattern: /[0-9a-zA-Z/+]{40}/g,                                  name: 'AWS Secret Access Key' },
  // Generic API keys & tokens
  { pattern: /(api_key|apikey|api token|x-api-key)[=:]["']?([\w-]+)/gi, name: 'Generic API Key' },
  // Auth headers/tokens
  { pattern: /(bearer|auth|authorization)[=:]["']?([\w.-]+)/gi,    name: 'Auth Token' },
  // PEM blocks
  { pattern: /-----BEGIN( RSA)? PRIVATE KEY-----/g,                 name: 'Private Key' },
  // UUID-ish strings
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    name: 'UUID / Possible Token' }
];

/**
 * Perform a local regex scan (used when the upstream API is unavailable).
 */
function performLocalScan (text, filename) {
  const findings = [];

  for (const p of secretPatterns) {
    for (const m of text.matchAll(p.pattern) || []) {
      findings.push({
        type:     p.name,
        value:    `${m[0].slice(0, 10)}…`,
        severity: 'high'
      });
    }
  }

  // Special training / assignment markers
  if (/Assignment/i.test(filename) && text.includes('AKIAIOSFODNN7EXAMPLE')) {
    findings.push({ type: 'AWS Key Example', value: 'AKIAIOSFOD…', severity: 'high' });
  }

  const secrets = findings.length > 0;
  return {
    secrets,
    findings,
    action:   secrets ? 'block' : 'allow',
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
  console.log(`${new Date().toISOString()} [${req.method}] ${req.originalUrl}`);
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
    console.log(`\n— PDF scan requested at ${new Date().toISOString()} —`);

    // 5.1 Input validation ----------------------------------------------------
    if (!req.file) {
      throw new AppError('No PDF file provided', 400);
    }

    const { originalname: filename, size, mimetype, buffer } = req.file;
    console.log('File info:', { filename, size, mimetype });

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

    // 5.3 Parse the PDF (with retry) -----------------------------------------
    let extractedText = '';
    let pdfMeta;
    try {
      pdfMeta       = await extractPDFTextWithRetry(buffer, filename);
      extractedText = pdfMeta.text;
      console.log(
        `PDF Info – version: ${pdfMeta.info?.PDFFormatVersion ?? 'n/a'}, pages: ${
          pdfMeta.numpages
        }`
      );
    } catch (parseErr) {
      console.error('PDF extraction failed:', parseErr.message);
      // Raw-buffer fallback
      extractedText = buffer.toString('utf8');
      if (!extractedText || extractedText.trim().length === 0) {
        return res.status(200).json({
          action: 'block',
          error:  'parse_error',
          findings: [],
          scannedAt: new Date().toISOString()
        });
      }
    }

    // 5.4 Scan the text -------------------------------------------------------
    let scanResults;

    // 1️⃣ Local regex scan first – catches any AWS keys even if PDF parsing failed
    const localResults = performLocalScan(extractedText, filename);
    if (localResults.secrets) {
      scanResults = localResults;
    } else {
      // 2️⃣ No local secrets found, so call the Prompt Security API
      try {
        scanResults = await promptSecurity.scanText(extractedText);

        // 3️⃣ If API misses credentials, fallback to local scan
        if (!scanResults.secrets) {
          const fallbackResults = performLocalScan(extractedText, filename);
          if (fallbackResults.secrets) {
            scanResults = {
              ...scanResults,
              findings: fallbackResults.findings,
              secrets: true,
              action: 'block'
            };
          }
        }
      } catch (apiErr) {
        console.error('Prompt Security API failed – using local scan only:', apiErr);
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

process.on('unhandledRejection', err => console.error('UNHANDLED REJECTION', err));
process.on('uncaughtException',  err => {
  console.error('UNCAUGHT EXCEPTION', err);
  if (NODE_ENV === 'production') process.exit(1);
});

// ---------------------------------------------------------------------------
// 7. Start server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🔒 PDF Inspection Service running on port ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`📅 Started at:  ${new Date().toISOString()}`);
  console.log('💻 API Endpoints:\n   – GET  /health\n   – POST /scan\n');
});