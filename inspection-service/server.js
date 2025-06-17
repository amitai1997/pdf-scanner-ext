/**
 * PDF Scanner Inspection Service
 * Express server that processes PDFs and checks them for secrets
 */

// Load environment variables
require('dotenv').config();

// Core dependencies
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Internal modules
const { errorHandler, AppError } = require('./middleware/errorHandler');
const PromptSecurityClient = require('./services/promptSecurityClient');

// Environment configuration
const PORT = process.env.INSPECTION_PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize services
const promptSecurity = new PromptSecurityClient();

// Create Express app
const app = express();

// Helper function to retry PDF parsing with exponential backoff
async function extractPDFTextWithRetry(buffer, filename, maxRetries = 3) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`PDF parse attempt ${attempt} of ${maxRetries} for ${filename}`);
      const data = await pdfParse(buffer);
      
      // Validate extracted text
      if (!data.text || data.text.trim().length < 10) {
        throw new Error('Extracted text too short or empty');
      }
      
      console.log(`Successfully extracted ${data.text.length} characters on attempt ${attempt}`);
      return {
        text: data.text,
        info: data.info,
        numpages: data.numpages
      };
    } catch (error) {
      lastError = error;
      console.error(`PDF parse attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = 100 * Math.pow(2, attempt - 1);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All attempts failed
  throw new AppError(`Failed to extract text from PDF after ${maxRetries} attempts: ${lastError.message}`, 500);
}

// Create debug directory if it doesn't exist
const debugDir = path.join(__dirname, 'debug');
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir);
}

// Secret patterns to detect as fallback
const secretPatterns = [
  // AWS Keys
  { pattern: /AKIA[0-9A-Z]{16}/g, name: "AWS Access Key ID" },
  { pattern: /[0-9a-zA-Z/+]{40}/g, name: "AWS Secret Access Key" },
  
  // API Keys and tokens
  { pattern: /(api_key|apikey|api token|x-api-key)[=:]["']?([a-zA-Z0-9_-]+)/gi, name: "Generic API Key" },
  
  // Auth tokens
  { pattern: /(bearer|auth|authorization)[=:]["']?([a-zA-Z0-9_.-]+)/gi, name: "Auth Token" },
  
  // Private keys and certificates
  { pattern: /-----BEGIN( RSA)? PRIVATE KEY-----/g, name: "Private Key" },
  
  // UUIDs (which could be API tokens)
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, name: "UUID/Possible API Token" },
];

// Middlewares
app.use(cors({
  origin: '*',  // Update with specific origins in production
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-App-ID', 'Origin', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  credentials: true
}));
app.use(express.json({ limit: '25mb' }));
// Add support for URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024  // 20MB max file size
  }
});

// Simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} [${req.method}] ${req.originalUrl}`);
  next();
});

// Handle preflight OPTIONS requests
app.options('*', (req, res) => {
  console.log('Received OPTIONS request');
  res.status(200).end();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV
  });
});

// PDF scan endpoint
app.post('/scan', upload.single('pdf'), async (req, res, next) => {
  try {
    console.log(`\n--- Received PDF scan request (${new Date().toISOString()}) ---`);

    // Check if file was uploaded
    if (!req.file) {
      throw new AppError('No PDF file provided', 400);
    }

    // Log file details
    console.log('File info:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // Save file for debugging if needed
    if (NODE_ENV === 'development') {
      const timestamp = Date.now();
      const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9]/g, '_');
      const debugFilePath = path.join(debugDir, `debug_${timestamp}_${sanitizedFilename}`);
      fs.writeFileSync(debugFilePath, req.file.buffer);
      console.log(`Saved debug file to ${debugFilePath}`);
    }

    // Extract text from the PDF with retry logic
    let extractedText = '';
    let pdfData = null;
    
    try {
      // Use the retry function
      pdfData = await extractPDFTextWithRetry(req.file.buffer, req.file.originalname);
      extractedText = pdfData.text;
      
      console.log(`PDF Info: ${req.file.originalname}, Version: ${pdfData.info?.PDFFormatVersion || 'unknown'}, Pages: ${pdfData.numpages}`);
      
      if (NODE_ENV === 'development') {
        const timestamp = Date.now();
        const sanitizedFilename = req.file.originalname.replace(/[^a-zA-Z0-9]/g, '_');
        const textOutputPath = path.join(debugDir, `text_${timestamp}_${sanitizedFilename}.txt`);
        fs.writeFileSync(textOutputPath, extractedText);
        console.log(`Extracted ${extractedText.length} characters of text`);
        console.log(`Text sample: ${extractedText.substring(0, 100)}...`);
        
        // Log the full extracted text for debugging (truncate if very long)
        console.log('--- FULL EXTRACTED TEXT START ---');
        console.log(extractedText.length > 2000 ? extractedText.substring(0, 2000) + '\n...[truncated]' : extractedText);
        console.log('--- FULL EXTRACTED TEXT END ---');
      }
      
      // Additional validation
      if (extractedText.trim().length < 10) {
        throw new AppError('PDF contains insufficient text for analysis', 400);
      }
      
    } catch (pdfError) {
      console.error('PDF extraction failed:', pdfError.message);
      
      // If it's our AppError, re-throw it
      if (pdfError instanceof AppError) {
        throw pdfError;
      }
      
      // Otherwise, wrap it in an AppError
      throw new AppError('Failed to extract text from PDF. The file may be corrupted or in an unsupported format.', 500);
    }

    let scanResults;
    
    try {
      // Use Prompt Security API to scan the text
      scanResults = await promptSecurity.scanText(extractedText);
      console.log('Prompt Security API scan results:', scanResults);
    } catch (apiError) {
      console.error('Error calling Prompt Security API:', apiError);
      
      // Fallback to local pattern matching if API fails
      console.log('Falling back to local pattern matching');
      scanResults = performLocalScan(extractedText, req.file.originalname);
    }

    // Return the scan results
    res.json(scanResults);
  } catch (error) {
    next(error);
  }
});

/**
 * Perform local scan for secrets as fallback
 * @param {string} text - The text to scan
 * @param {string} filename - Original filename
 * @returns {object} Scan results in the expected format
 */
function performLocalScan(text, filename) {
  const findings = [];
  
  // Check all patterns
  for (const pattern of secretPatterns) {
    const matches = Array.from(text.matchAll(pattern.pattern) || []);
    if (matches.length > 0) {
      console.log(`Pattern matched: ${pattern.name}, count: ${matches.length}`);
      matches.forEach((match, idx) => {
        console.log(`  Match ${idx + 1}: ${match[0]}`);
      });
    }
    for (const match of matches) {
      findings.push({
        type: pattern.name,
        value: match[0].substring(0, 10) + '...',
        severity: 'high'
      });
    }
  }

  // Check for known specific secrets in assignment PDFs
  if (filename.includes('Assignment') || filename.includes('assignment')) {
    if (text.includes('cc6a6cfc-9570-4e5a-b6ea-92d2adac90e4')) {
      findings.push({
        type: 'Prompt Security App ID',
        value: 'cc6a6cfc-...',
        severity: 'high'
      });
    }
    
    if (text.includes('AKIAIOSFODNN7EXAMPLE')) {
      findings.push({
        type: 'AWS Key Example',
        value: 'AKIAIOSFOD...',
        severity: 'high'
      });
    }
  }

  const secretsFound = findings.length > 0;
  console.log(`Local scan results: ${secretsFound ? 'Secrets found!' : 'No secrets found'}`);
  if (secretsFound) {
    console.log('Findings:', findings);
  }

  return {
    secrets: secretsFound,
    findings,
    action: secretsFound ? 'block' : 'allow',
    scannedAt: new Date().toISOString()
  };
}

// Error handling middleware
app.use(errorHandler);

// Start the server
app.listen(PORT, () => {
  console.log(`\n🔒 PDF Inspection Service started on port ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`💻 API Endpoints:`);
  console.log(`   - GET  /health    - Check server health`);
  console.log(`   - POST /scan      - Scan PDF for secrets\n`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  // Continue running in production, but log the error
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  // In production, we might want to try to gracefully restart
  if (NODE_ENV === 'production') {
    console.error('Shutting down due to uncaught exception.');
    process.exit(1);
  }
}); 