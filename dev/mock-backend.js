// PDF Scanner Extension - Mock Backend Server
// This is a simple Express server to simulate the backend API during development

// To run: npm run dev:backend
// Server will listen on port 8080 by default or port specified in .env

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get directory name for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '../uploads');
      
      // Create upload directory if it doesn't exist
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `scan-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
  fileFilter: function (req, file, cb) {
    // Accept only PDF files
    if (!file.originalname.toLowerCase().endsWith('.pdf') && 
        !file.mimetype.includes('pdf')) {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  }
});

// Create Express app
const app = express();
const PORT = process.env.DEV_BACKEND_PORT || 8080;

// Enable Cross-Origin Resource Sharing
app.use(cors());

// Parse JSON requests
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.send('PDF Scanner Mock Backend is running');
});

// Scan endpoint
app.post('/scan', upload.single('pdf'), (req, res) => {
  try {
    console.log('Received scan request');
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: 'No PDF file uploaded'
      });
    }
    
    console.log(`Received file: ${req.file.originalname} (${req.file.size} bytes)`);
    console.log(`Saved as: ${req.file.filename}`);
    
    // Log headers for debugging
    console.log('Headers:', {
      contentType: req.headers['content-type'],
      appId: req.headers['x-app-id']
    });
    
    // Check if App ID is provided
    const appId = req.headers['x-app-id'];
    if (!appId) {
      console.warn('Missing App ID header');
      // Continue processing anyway for development
    }
    
    // In a real backend, we would extract and analyze the PDF here
    
    // For mock backend, use simple filename-based detection
    const filename = req.file.originalname.toLowerCase();
    const hasSecrets = 
      filename.includes('secret') || 
      filename.includes('aws') || 
      filename.includes('key') ||
      filename.includes('pass') ||
      filename.includes('token') ||
      filename.includes('auth');
    
    // Simulate processing delay
    setTimeout(() => {
      // Send response
      if (hasSecrets) {
        console.log(`Secrets detected in ${req.file.originalname}`);
        res.json({
          secrets: true,
          findings: [
            {
              type: 'AWS_ACCESS_KEY',
              confidence: 0.95,
              location: 'page 1, line 15',
              snippet: 'AKIA...'
            },
            {
              type: 'PASSWORD',
              confidence: 0.88,
              location: 'page 2, line 7',
              snippet: 'Password=...'
            }
          ],
          filename: req.file.originalname,
          action: 'block',
          scannedAt: new Date().toISOString()
        });
      } else {
        console.log(`No secrets detected in ${req.file.originalname}`);
        res.json({
          secrets: false,
          findings: [],
          filename: req.file.originalname,
          action: 'allow',
          scannedAt: new Date().toISOString()
        });
      }
    }, 1000);
    
  } catch (error) {
    console.error('Error processing scan request:', error);
    res.status(500).json({
      error: 'Error processing scan request',
      message: error.message
    });
  }
});

// Error handler for file size exceeding limit
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'Maximum file size is 20MB'
      });
    }
  }
  next(err);
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock backend server running at http://localhost:${PORT}`);
  console.log(`Upload endpoint available at http://localhost:${PORT}/scan`);
  console.log(`CORS enabled for extension access`);
}); 