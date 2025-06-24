# PDF Scanner Chrome Extension

## Overview

PDF Scanner is a Chrome extension that intercepts PDF uploads to AI services (ChatGPT, Claude, Gemini, etc.) and scans them for sensitive information **before** they leave your browser. It relies on a lightweight inspection service that forwards extracted text to the Prompt Security API. This prevents accidental data leaks by detecting secrets, credentials and other sensitive data in real time.

### Key Features

- **Real-time PDF scanning** – Intercepts uploads before they reach AI services
- **Instant alerts** – Visual warnings when secrets are detected
- **Multiple detection methods** – File selection, drag & drop and clipboard paste
- **Daily statistics** – Track your scanning activity
- **Graceful degradation** – Allows uploads when service is unavailable
- **Zero-config** – Works out of the box with sensible defaults

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
  <img src="public/sequence_diagram.svg" alt="Sequence Diagram" width="700">
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

> **Note**: The template includes a test APP_ID for development. For production use, obtain your own credentials from [Prompt Security](https://prompt.security).

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

### Manual Testing

1. **Test with a safe PDF**: Upload any regular PDF to ChatGPT
2. **Test with secrets**: Create a PDF containing the test secret `AKIAIOSFODNN7EXAMPLE`
3. **Test edge cases**: Try drag & drop, clipboard paste, and large files

---


## Technical Architecture

### Content Script Loading

The extension uses traditional script loading instead of ES6 modules for maximum browser compatibility. Scripts are loaded in a specific order via `manifest.json`:

1. **Shared dependencies** (`constants.js`, `logger.js`, `pdfDetection.js`)
2. **DOM helpers** (`domHelpers.js`)
3. **Upload interception** (`pdfInterceptor.js`)
4. **UI components** (`PDFMonitorUI.js`)
5. **Main logic** (`pdfMonitor.js`, `index.js`)

This approach ensures all dependencies are available globally before dependent code executes, avoiding module loading issues in Chrome extensions.

### Key Components

- **PDFMonitor** – Orchestrates PDF detection and scanning
- **PDFInterceptor** – Hooks into file inputs, drag & drop and clipboard events
- **Background worker** – Sends scan requests and tracks statistics
- **PDFMonitorUI** – Displays indicators and warnings
- **Shared utilities** – Common helpers used across extension and service

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

- **Browser Support**: Chrome only (Manifest V3) - uses traditional script loading for compatibility
- **File Size**: Maximum 20MB per PDF (configurable in constants)
- **API Dependency**: Requires active Prompt Security API connection for scanning
- **Text Extraction**: Some PDF formats may not extract text properly
- **Language Support**: Best results with English content
- **Module System**: Uses traditional script loading instead of ES6 modules for Chrome extension compatibility
- **Performance**: Large PDFs may cause brief UI freezing during processing

### Planned Improvements

- [ ] Firefox support (requires ES6 module conversion)
- [ ] Offline scanning capability  
- [ ] Support for other file types (DOCX, TXT)
- [ ] Bulk scanning interface
- [ ] Custom detection rules
- [x] **Content script compatibility** - Converted from ES6 modules to traditional loading
- [x] **Improved error handling** - Fixed undefined reference errors and UI method calls

---

## Performance Optimization Ideas

### Implemented
- Deterministic PDF parsing with caching
- Request deduplication using content hashing
- Graceful degradation when API unavailable

### Planned Optimizations
- Batch Processing: Queue multiple files for efficient scanning
- Compression: Gzip request/response payloads
- Temporary scan disable option: Allow users to pause scanning for a limited time.
- Scan history: Maintain a log of past scans for user reference.
- Trusted PDF whitelist: Let users mark certain PDFs as safe to bypass scanning.
- Explicit timeouts for large files: Set clear limits to avoid hanging on oversized PDFs.
- Retry on network failures: Automatically attempt to rescan if a network error occurs.
- Basic test coverage: Add simple tests to ensure core features work as expected.
