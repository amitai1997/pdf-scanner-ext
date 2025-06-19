# PDF Scanner Chrome Extension

## Overview

PDF Scanner is a Chrome extension that intercepts PDF uploads to AI services (ChatGPT, Claude, Gemini, etc.) and scans them for sensitive information **before** they leave your browser. It helps prevent accidental data leaks by detecting secrets, credentials, and other sensitive data in real-time.

### Key Features

- **Real-time PDF scanning** - Intercepts uploads before they reach AI services
- **Instant alerts** - Visual warnings when secrets are detected
- **Multiple detection methods** - File selection, drag & drop, clipboard paste, XHR/fetch
- **Daily statistics** - Track your scanning activity
- **Graceful degradation** - Allows uploads when service is unavailable
- **Zero-config** - Works out of the box with sensible defaults

### Architecture

<div align="center">
  <img src="public/architecture.svg" alt="Architecture Diagram" width="600">
</div>

The system consists of three main components:

1. **Chrome Extension** - Monitors web pages and intercepts PDF uploads
2. **Inspection Service** - Extracts text from PDFs and coordinates scanning
3. **Prompt Security API** - ML-powered secret detection service

<details>
<summary>Sequence Diagram</summary>

<div align="center">
  <img src="public/sequence_diagram.png" alt="Sequence Diagram" width="700">
</div>

</details>

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16.0.0 or higher) - [Download](https://nodejs.org/)
- **Docker** & **Docker Compose** - [Download](https://www.docker.com/products/docker-desktop/)
- **Google Chrome** (latest version) - [Download](https://www.google.com/chrome/)
- **Git** - [Download](https://git-scm.com/)

---

## Quick Start

Get up and running in under 5 minutes:

```bash
# 1. Clone the repository
git clone https://github.com/amitai1997/pdf-scanner-ext.git
cd pdf-scanner-ext

# 2. Set up the inspection service
cd inspection-service
cp env.template .env
# Edit .env with your preferred editor to add API credentials

# 3. Start the backend service
cd ..
docker-compose up --build

# 4. Load the extension in Chrome
# - Open chrome://extensions
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select the project folder
```

**That's it!** Visit ChatGPT or Claude and try uploading a PDF to see it in action.

---

## Detailed Setup Guide

### Step 1: Repository Setup

```bash
git clone https://github.com/amitai1997/pdf-scanner-ext.git
cd pdf-scanner-ext
```

### Step 2: Backend Configuration

The inspection service requires configuration through environment variables:

```bash
cd inspection-service
cp env.template .env
```

Edit the `.env` file:

```env
# Required: Prompt Security API credentials
PROMPT_SECURITY_APP_ID=your-app-id-here

# Optional: Service configuration
INSPECTION_PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
```

An `.env.example` is provided in the repo root with the same variable for convenience. Obtain your own credentials from [Prompt Security](https://prompt.security).

### Step 3: Start the Inspection Service

Using Docker Compose (recommended):

```bash
cd ..  # Return to project root
docker-compose up --build
```

<details>
<summary>Alternative: Run without Docker</summary>

```bash
cd inspection-service
npm install
npm run dev
```

</details>

The service will be available at `http://localhost:3001`. Verify it's running:

```bash
curl http://localhost:3001/health
```

### Step 4: Install the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the project's root folder
5. The extension icon should appear in your toolbar

### Step 5: Verify Installation

1. Click the extension icon - you should see "Active - Monitoring uploads"
2. Visit the health endpoint: `http://localhost:3001/health`
3. Check Docker logs: `docker-compose logs -f`

---

## Testing

### Running Tests

Unit tests use **Jest** and end‑to‑end tests run with **Playwright**.

```bash
npm test         # run Jest unit tests
npm run test:e2e # launch Playwright and run extension tests
```

### Manual Testing

1. **Test with a safe PDF**: Upload any regular PDF to ChatGPT
2. **Test with secrets**: Create a PDF containing the test secret `AKIAIOSFODNN7EXAMPLE`
3. **Test edge cases**: Try drag & drop, clipboard paste, and large files

---

## Project Structure

```
pdf-scanner-ext/
├── inspection-service/          # Backend service
│   ├── server.js               # Express server
│   ├── middleware/             # Express middleware
│   ├── services/               # External service clients
│   └── utils/                  # Utility functions
├── src/                        # Extension source
│   ├── background.js           # Service worker
│   ├── content.js              # Content script
│   ├── popup.js                # Popup controller
│   ├── shared/                 # Shared utilities
│   └── utils/                  # Extension utilities
├── public/                     # Static assets
│   ├── popup.html              # Extension popup
│   ├── icons/                  # Extension icons
│   └── styles/                 # CSS files
├── manifest.json               # Extension manifest
├── docker-compose.yml          # Docker configuration
└── README.md                   # This file
```

---

## Production Readiness

1. **Package & Sign**
   - Build extension with deterministic process
   - Review manifest permissions and origins
   - Package for Chrome Web Store submission

2. **Deploy Backend**
   - Configure production environment and secrets
   - Set up HTTPS with valid certificates
   - Enable monitoring and health checks

3. **Testing Pipeline**
   - Implement core test suite (≥85% coverage)
   - Set up CI/CD for automated checks
   - Configure automated deployment

4. **Security Review**
   - Complete manual extension testing
   - Run dependency vulnerability scans
   - Verify no hardcoded secrets

5. **Launch & Monitor**
   - Publish to Chrome Web Store
   - Deploy backend to production
   - Monitor 24h post-release

---

## Limitations

### Current Limitations

- **Browser Support**: Tested only on Chrome (Manifest V3)
- **File Size**: Maximum 20MB per PDF (configurable)
- **API Dependency**: Requires active Prompt Security API connection
- **Text Extraction**: Some PDF formats may not extract text properly
- **Language Support**: Best results with English content
- **Performance**: Large PDFs may cause brief UI freezing

### Planned Improvements

- [ ] Firefox support
- [ ] Offline scanning capability
- [ ] Support for other file types (DOCX, TXT)
- [ ] Bulk scanning interface
- [ ] Custom detection rules

---

## Performance Optimization Ideas

### Implemented
- Deterministic PDF parsing with caching
- Request deduplication using content hashing
- Graceful degradation when API unavailable

### Planned Optimizations
- WebAssembly Integration: Move PDF parsing to WASM for speed improvement
- Incremental Scanning: Stream-based processing for large files
- Smart Caching: LRU cache with 24-hour TTL for repeated uploads
- Web Workers: Offload heavy processing to background threads
- Batch Processing: Queue multiple files for efficient scanning
- CDN Distribution: Serve extension assets from edge locations
- Compression: Gzip request/response payloads
- Connection Pooling: Reuse HTTP connections to API
- Temporary scan disable option: Allow users to pause scanning for a limited time.
- Detailed scan results: Display more granular information about detected issues.
- Scan history: Maintain a log of past scans for user reference.
- Trusted PDF whitelist: Let users mark certain PDFs as safe to bypass scanning.
- Explicit timeouts for large files: Set clear limits to avoid hanging on oversized PDFs.
- Improved handling of corrupted PDFs: Detect and gracefully report unreadable or malformed files.
- Retry on network failures: Automatically attempt to rescan if a network error occurs.
- Basic test coverage: Add simple tests to ensure core features work as expected.
