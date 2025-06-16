# PDF Scanner Extension - Development Guide

## Overview
This document provides detailed instructions for developing the PDF Scanner Extension, including how to use the mock backend, test different scenarios, and debug the Chrome extension.

## Development Environment Setup

### Prerequisites
- Node.js (v16 or higher)
- npm (v7 or higher)
- Chrome or Chromium-based browser

### Initial Setup
1. Clone the repository
2. Install dependencies:
   ```bash
   npm ci
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

## Mock Backend

### Overview
The extension includes a mock backend server that simulates the PDF scanning API during development. This allows you to test the extension without connecting to the real Prompt Security API.

### Running the Mock Backend
```bash
npm run dev:backend
```

The server will start on port 8080 (or the port specified in your `.env` file).

### Mock Backend Features
- **Endpoint**: `http://localhost:8080/scan`
- **Detection Method**: The mock backend detects "secrets" based on the filename. If the filename contains any of the following keywords, it will be flagged as containing secrets:
  - `secret`
  - `aws`
  - `key`
  - `pass`
  - `token`
  - `auth`
- **Response Format**: The backend returns a JSON response with the scan result:
  ```json
  {
    "secrets": true|false,
    "findings": [...],
    "filename": "document.pdf",
    "action": "block"|"allow",
    "scannedAt": "2023-11-01T12:00:00Z"
  }
  ```

### Customizing the Mock Backend
You can modify `dev/mock-backend.js` to customize the behavior of the mock backend, such as:
- Changing detection rules
- Adding delays to simulate network latency
- Simulating errors or timeouts

## Running the Extension

### Development Mode
```bash
npm run dev
```
This command starts both the mock backend and the Chrome extension in development mode.

### Loading the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top-right corner)
3. Click "Load unpacked" and select the extension directory

## Testing Scenarios

### Testing PDF Detection Methods
The extension uses three different methods to detect PDF uploads:

1. **File Input Monitoring** (Primary Method)
   - Directly select a PDF file using a file input
   - The extension will detect this immediately and scan the PDF

2. **WebRequest API** (Backup Method)
   - Upload a PDF through a form submission
   - The extension will intercept the request and scan the PDF

3. **XHR/Fetch Overrides** (Fallback Method)
   - Programmatic uploads via JavaScript
   - The extension will detect these through its XHR/fetch overrides

### Test Files
Create test PDFs with different characteristics:
- `secret-test.pdf` - Will be flagged as containing secrets
- `clean-test.pdf` - Will be allowed
- `large-test.pdf` - A file larger than 20MB to test size limits

### Testing on Different Platforms
- **ChatGPT**: Use the file upload button in the ChatGPT interface
- **Claude**: Use the file attachment feature in Claude
- **Other AI Services**: The extension should work with any service that accepts PDF uploads

## Debugging Tips

### Extension Debugging
1. Open Chrome DevTools for the extension:
   - Right-click the extension icon
   - Select "Inspect popup"
   - Switch to the "Console" tab

2. Background Script Debugging:
   - Go to `chrome://extensions/`
   - Find the PDF Scanner extension
   - Click "service worker" link under "Inspect views"

3. Content Script Debugging:
   - Open DevTools on a supported website (e.g., ChatGPT)
   - Look for logs prefixed with `[PDF Scanner]`

### Common Issues and Solutions

#### Extension Not Detecting PDFs
- Check if the content script is loaded (look for the "Content script loaded" message in the console)
- Verify that the website matches one of the patterns in the manifest.json
- Try reloading the extension and the page

#### Mock Backend Connection Issues
- Ensure the mock backend is running (`npm run dev:backend`)
- Check if the port matches in both the backend and the extension
- Verify that the host permission for localhost is in the manifest.json

#### Scan Results Not Showing
- Check the console for errors
- Verify that the PDF is being detected and sent to the backend
- Ensure the response from the backend is properly formatted

## Development Workflow

### Making Changes
1. Modify code in the `src` directory
2. Save changes
3. Reload the extension in Chrome:
   - Go to `chrome://extensions/`
   - Click the refresh icon on the PDF Scanner extension

### Code Style and Linting
- Run linting: `npm run lint`
- Fix linting issues: `npm run lint:fix`
- Format code: `npm run format`

### Testing
- Run tests: `npm test`
- Watch mode: `npm run test:watch`

## Building for Production
```bash
npm run build
```
This will create a ZIP file in the `dist` directory that can be uploaded to the Chrome Web Store.

## Next Steps (Day 3)
1. Implement real backend integration
2. Add authentication/API key management
3. Implement actual PDF text extraction
4. Connect to real Prompt Security API
5. Add production build process
6. Implement proper error handling and retry logic 